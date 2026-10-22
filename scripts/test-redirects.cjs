// node scripts/test-redirects.cjs — redirects (src/redirects.js): path matching, query
// handling, system pages winning, hit counting, admin validation and the WordPress
// Redirection import plan. Runs on the JSON fallback store in a temp folder.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { createRedirectStore, validateInput, sourceKey, normalizeTarget, planWordPressImport, parseWpDate } = require('../src/redirects');
const { createRouter } = require('../src/routes/redirectsAdmin');

(async () => {
  // ── Pure helpers ──
  assert.equal(sourceKey('/Zalo/'), '/zalo');
  assert.equal(sourceKey('zalo?x=1'), '/zalo');
  assert.equal(sourceKey('/'), '/');
  assert.equal(sourceKey('/C%C3%A1ch'), '/cách');
  assert.equal(normalizeTarget('https://phamthanhbien.com/loinhuan/?a=1'), '/loinhuan/?a=1', 'Own host becomes a relative path');
  assert.equal(normalizeTarget('https://event.phamthanhbien.com/zoom'), '/zoom');
  assert.equal(normalizeTarget('hoitu'), '/hoitu');
  assert.equal(normalizeTarget('https://zalo.me/g/abc'), 'https://zalo.me/g/abc');
  assert.equal(parseWpDate('22 Tháng 10, 2026'), '2026-10-21T17:00:00.000Z');
  assert.throws(() => validateInput({ source: 'zalo', target: '/x' }), /bắt đầu bằng/);
  assert.throws(() => validateInput({ source: '/a?b=1', target: '/x' }), /tham số/);
  assert.throws(() => validateInput({ source: '/a', target: '' }), /đích/);
  assert.throws(() => validateInput({ source: '/a', target: '/a/' }), /vòng/);
  assert.throws(() => validateInput({ source: '/a', target: '/b', code: 200 }), /Mã/);
  assert.deepEqual(validateInput({ source: '/a', target: 'https://x.y/' }), { source: '/a', target: 'https://x.y/', code: 301, query_mode: 'pass', enabled: true, group_name: '', title: '', note: '' });

  // ── Store, middleware and admin on the JSON fallback ──
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'redirects-'));
  const offline = Object.assign(new Error('offline'), { code: 'ECONNREFUSED' });
  const store = createRedirectStore({ database: { query: async () => { throw offline; } }, directory, fallback: true, flushMs: 3600e3, isSystemPath: key => key === '/system' || key.startsWith('/admin') });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.adminUser = { email: 'admin@example.invalid' }; next(); });
  app.use('/admin/redirects', createRouter({ store }));
  app.get('/system', (req, res) => res.send('system page'));
  app.use(store.middleware());
  app.use((req, res) => res.status(404).send('not found'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = async (method, route = '', body) => {
    const res = await fetch(`${base}/admin/redirects${route}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  };
  const visit = async (url, method = 'GET') => { const res = await fetch(base + url, { redirect: 'manual', method }); return { status: res.status, location: res.headers.get('location') }; };
  try {
    const zalo = (await admin('POST', '', { source: '/Zalo', target: 'https://zalo.me/g/abc', group_name: 'Social' })).data.redirect;
    assert.equal(zalo.source_key, '/zalo'); assert.equal(zalo.created_by, 'admin@example.invalid');
    await admin('POST', '', { source: '/web', target: 'https://example.invalid/register?ref=site', query_mode: 'pass', code: 302 });
    await admin('POST', '', { source: '/doc', target: '/tai-lieu#muc-2', query_mode: 'pass' });
    await admin('POST', '', { source: '/old', target: '/new', query_mode: 'ignore' });

    assert.deepEqual(await visit('/zalo'), { status: 301, location: 'https://zalo.me/g/abc' });
    assert.deepEqual(await visit('/ZALO/'), { status: 301, location: 'https://zalo.me/g/abc' }, 'No case or trailing slash');
    assert.deepEqual(await visit('/zalo', 'HEAD'), { status: 301, location: 'https://zalo.me/g/abc' });
    assert.deepEqual(await visit('/web?utm_source=fb&x=1'), { status: 302, location: 'https://example.invalid/register?ref=site&utm_source=fb&x=1' }, 'Query passed with &');
    assert.deepEqual(await visit('/doc?utm_source=fb'), { status: 301, location: '/tai-lieu?utm_source=fb#muc-2' }, 'Query goes before the hash');
    assert.deepEqual(await visit('/old?utm_source=fb'), { status: 301, location: '/new' }, 'Ignored query');
    assert.equal((await visit('/missing')).status, 404);
    assert.equal((await fetch(base + '/zalo', { method: 'POST', redirect: 'manual' })).status, 404, 'Only GET and HEAD redirect');

    // System pages and duplicates are refused; a system page wins anyway.
    assert.equal((await admin('POST', '', { source: '/system', target: '/x' })).status, 409);
    assert.equal((await admin('POST', '', { source: '/zalo/', target: '/x' })).status, 409, 'One enabled rule per path');
    assert.equal((await admin('POST', '', { source: '/zalo', target: '/x', enabled: false })).status, 200, 'A disabled duplicate is allowed');
    assert.equal(await (await fetch(base + '/system')).text(), 'system page');

    // Hits: counted in memory, written on flush, shown by the admin list.
    await visit('/zalo'); await store.flush();
    let list = (await admin('GET')).data.redirects;
    const counted = list.find(r => r.id === zalo.id);
    assert.equal(counted.hits, 4, 'Every redirect is one hit'); assert.ok(counted.last_access_at);

    // Edit, switch off, delete.
    assert.equal((await admin('PUT', `/${zalo.id}`, { target: 'https://zalo.me/g/new' })).data.redirect.target, 'https://zalo.me/g/new');
    assert.equal((await visit('/zalo')).location, 'https://zalo.me/g/new', 'Changes apply at once');
    await admin('PUT', `/${zalo.id}`, { enabled: false });
    assert.equal((await visit('/zalo')).status, 404, 'A disabled rule does not answer');
    const duplicate = list.find(r => r.source === '/zalo' && !r.enabled);
    assert.equal((await admin('PUT', `/${duplicate.id}`, { enabled: true })).status, 200, 'The other rule can be switched on now');
    assert.equal((await visit('/zalo')).location, '/x');
    assert.equal((await admin('PUT', `/${zalo.id}`, { enabled: true })).status, 409, 'Switching on a second rule for the path is refused');
    assert.equal((await admin('PUT', `/${zalo.id}`, { target: '/zalo' })).status, 400, 'No loop on edit');
    assert.equal((await admin('DELETE', `/${zalo.id}`)).status, 200);
    assert.equal((await admin('DELETE', `/${zalo.id}`)).status, 404);

    // ── WordPress Redirection import ──
    const exported = {
      groups: [{ id: 1, name: 'Redirections' }],
      redirects: [
        { id: 1, url: '/zalo', match_url: '/zalo', match_type: 'url', action_type: 'url', action_code: 301, action_data: { url: 'https://zalo.me/g/first' }, match_data: { source: { flag_query: 'pass' } }, hits: 100, position: 2, group_id: 1, enabled: true, last_access: '22 Tháng 10, 2026' },
        { id: 2, url: '/zalo', match_url: '/zalo', match_type: 'url', action_type: 'url', action_code: 301, action_data: { url: 'https://phamthanhbien.com/zalo' }, match_data: { source: { flag_query: 'pass' } }, hits: 5, position: 3, group_id: 1, enabled: true, last_access: '-' },
        { id: 3, url: '/system/', match_url: '/system', match_type: 'url', action_type: 'url', action_code: 301, action_data: { url: 'https://t.me/x' }, match_data: { source: { flag_query: 'exact' } }, hits: 7, position: 1, group_id: 1, enabled: true },
        { id: 4, url: '/trading', match_url: '/trading', match_type: 'url', action_type: 'url', action_code: 301, action_data: { url: 'https://event.phamthanhbien.com/trading' }, match_data: { source: { flag_query: 'ignore' } }, hits: 9, position: 4, group_id: 1, enabled: true },
        { id: 5, url: '/yt', match_url: '/yt', match_type: 'url', action_type: 'url', action_code: 301, action_data: { url: 'https://short.example/yt' }, match_data: { source: { flag_query: 'ignore' } }, hits: 1, position: 5, group_id: 1, enabled: true },
        { id: 6, url: '/re', match_url: '/re', match_type: 'url', action_type: 'url', action_code: 301, action_data: { url: '/x' }, match_data: { source: {} }, regex: true, hits: 0, position: 6, group_id: 1, enabled: true },
      ],
    };
    const isSystemPath = key => key === '/system' || key === '/trading';
    const { rows, report } = planWordPressImport(exported, { isSystemPath, targets: { '/yt': 'https://youtube.example/c' }, extra: [{ source: '/lien-he', target: '/', group_name: 'Old' }, { source: '/zalo', target: '/' }] });
    assert.deepEqual(report.renamed.map(r => [r.from, r.to]), [['/system', '/system-2']]);
    assert.deepEqual(report.disabled.map(r => r.wp_id), [2, 4], 'Links to the same path on this system are disabled');
    assert.deepEqual(report.retargeted.map(r => r.to), ['https://youtube.example/c']);
    assert.deepEqual(report.skipped.map(r => r.source || r.wp_id), ['/re', '/zalo']);
    assert.deepEqual(report.extra.map(r => r.source), ['/lien-he']);
    const first = rows.find(r => r.wp_id === 1);
    assert.deepEqual({ q: first.query_mode, hits: first.hits, at: first.last_access_at, g: first.group_name }, { q: 'pass', hits: 100, at: '2026-10-21T17:00:00.000Z', g: 'Redirections' });
    assert.equal(rows.find(r => r.wp_id === 3).query_mode, 'ignore', 'Exact query matching becomes "ignore": links with ?fbclid still work');
    assert.equal(rows.find(r => r.wp_id === -1).target, '/');

    const imported = await store.importRows(rows);
    assert.deepEqual(imported, { inserted: rows.length, updated: 0 });
    assert.equal((await visit('/zalo')).location, 'https://zalo.me/g/first', 'The lowest position answers, as in Redirection');
    assert.equal((await visit('/system-2')).location, 'https://t.me/x');
    assert.equal((await visit('/yt')).location, 'https://youtube.example/c');
    assert.equal((await visit('/lien-he?a=1')).location, '/?a=1');
    await store.flush();
    const again = await store.importRows(rows);
    assert.deepEqual(again, { inserted: 0, updated: rows.length }, 'Re-running the import updates by WordPress ID');
    list = (await admin('GET')).data.redirects;
    assert.equal(list.find(r => r.wp_id === 3).hits, 8, 'Hits counted here survive a re-import');
    console.log('PASS: redirects match without case/trailing slash, pass or drop the query, lose to system pages, count hits, refuse loops and duplicates, and import the WordPress Redirection export (renamed, disabled, retargeted, re-runnable).');
  } finally {
    server.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exit(1); });
