// node scripts/test-site.cjs — the site address in one place (src/site.js, roadmap 4.1):
// defaults keep event.phamthanhbien.com; SITE_URL moves links, pages and stored media paths;
// LEGACY_HOSTS sends pages (not APIs or POSTs) to the new address with a 301.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const express = require('express');

// Each case loads src/site.js in a fresh process with its own environment.
const run = (env, code) => JSON.parse(execFileSync(process.execPath, ['-e', `const site = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'site.js'))}); console.log(JSON.stringify(${code}));`],
  { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot || '', ...env } }).toString());

async function main() {
  // Defaults: today's address.
  assert.deepEqual(run({}, '[site.SITE_URL, site.SITE_HOST, site.LEGACY_HOSTS, site.absoluteUrl("/zoom")]'),
    ['https://event.phamthanhbien.com', 'event.phamthanhbien.com', [], 'https://event.phamthanhbien.com/zoom']);
  assert.deepEqual(run({ PUBLIC_BASE_URL: 'http://localhost:3001/' }, '[site.SITE_URL, site.localPath("http://localhost:3001/storage/a.jpg")]'), ['https://event.phamthanhbien.com', '/storage/a.jpg'], 'PUBLIC_BASE_URL (uploads) is one of our hosts, not the site address');
  assert.equal(run({}, 'site.withSiteUrl("<meta content=\\"https://event.phamthanhbien.com/richlife\\">")'), '<meta content="https://event.phamthanhbien.com/richlife">');

  // After the move.
  const moved = { SITE_URL: 'https://phamthanhbien.com', LEGACY_HOSTS: 'event.phamthanhbien.com, phamthanhbien.com', PUBLIC_BASE_URL: 'https://event.phamthanhbien.com' };
  assert.deepEqual(run(moved, '[site.SITE_URL, site.LEGACY_HOSTS]'), ['https://phamthanhbien.com', ['event.phamthanhbien.com']], 'SITE_URL wins; its own host is never legacy');
  assert.equal(run(moved, 'site.withSiteUrl("<link href=\\"https://event.phamthanhbien.com/richlife\\"><img src=\\"https://event.phamthanhbien.com/p/a.jpg\\">")'),
    '<link href="https://phamthanhbien.com/richlife"><img src="https://phamthanhbien.com/p/a.jpg">');
  // Media stored with the old address stay local files.
  assert.deepEqual(run(moved, '["https://event.phamthanhbien.com/storage/cms-media/a.jpg", "https://phamthanhbien.com/storage/b.png", "/storage/c.jpg", "https://cdn.example/d.jpg", "https://www.phamthanhbien.com"].map(site.localPath)'),
    ['/storage/cms-media/a.jpg', '/storage/b.png', '/storage/c.jpg', 'https://cdn.example/d.jpg', '/']);

  // The redirect: pages on an old host move; APIs, POSTs and the new host are served.
  const { legacyRedirect } = require('../src/site');
  const app = express();
  app.use(legacyRedirect({ legacy: ['event.phamthanhbien.com'], siteUrl: 'https://phamthanhbien.com' }));
  app.all('*', (req, res) => res.send('served'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  // fetch cannot set Host; http.request can.
  const call = (route, { host = 'event.phamthanhbien.com', method = 'GET' } = {}) => new Promise((resolve, reject) => {
    const req = http.request(base + route, { method, headers: { host } }, res => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, headers: { get: name => res.headers[name] || null } })); });
    req.on('error', reject); req.end();
  });
  try {
    let res = await call('/richlife?utm_source=zalo&x=1');
    assert.deepEqual([res.status, res.headers.get('location')], [301, 'https://phamthanhbien.com/richlife?utm_source=zalo&x=1']);
    res = await call('/', { method: 'HEAD' });
    assert.deepEqual([res.status, res.headers.get('location')], [301, 'https://phamthanhbien.com/']);
    assert.equal((await call('/api/register', { method: 'POST' })).status, 200, 'Forms and webhooks still post to the old host');
    assert.equal((await call('/api/partner/v1/capabilities')).status, 200, 'API GETs are not redirected (Authorization would be dropped)');
    assert.equal((await call('/admin/', { method: 'POST' })).status, 200);
    assert.equal((await call('/richlife', { host: 'phamthanhbien.com' })).status, 200, 'The new host serves');
    assert.equal((await call('/richlife', { host: 'event.phamthanhbien.com:443' })).status, 301, 'A port in Host is ignored');
  } finally { server.close(); }
  console.log('PASS: site address — defaults keep event.phamthanhbien.com, SITE_URL moves links/pages/media paths, LEGACY_HOSTS 301 for pages only (APIs and POSTs served on the old host).');
}

main().catch(error => { console.error(error); process.exit(1); });
