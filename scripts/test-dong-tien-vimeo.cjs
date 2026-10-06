const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createVimeoClient, thumbnailName } = require('../src/dongTienVimeo');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dong-tien-vimeo-'));
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6tSIAAAAASUVORK5CYII=', 'base64');
  const calls = [];
  const video = id => ({ uri: `/videos/${id}`, name: `Lesson ${id}`, duration: 100, link: `https://vimeo.com/${id}/privatehash`, pictures: { sizes: [{ width: 640, link: `https://i.vimeocdn.com/video/${id}.png` }] } });
  const reply = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
  let badNext = false, oversized = false;
  const fetchImpl = async (address, options) => {
    const url = new URL(address); calls.push({ url, options });
    if (url.hostname === 'api.vimeo.com') {
      if (url.searchParams.get('page') === '2') return reply({ data: [video(202)], paging: { next: null } });
      return reply({ data: [video(101)], paging: { next: badNext ? 'https://external.invalid/steal' : '/me/projects/29758694/videos?page=2' } });
    }
    if (url.pathname === '/api/oembed.json') {
      assert.equal(url.searchParams.get('url'), 'https://vimeo.com/303/privatehash');
      return reply({ thumbnail_url: 'https://i.vimeocdn.com/video/303.png' });
    }
    if (url.hostname === 'i.vimeocdn.com') return new Response(bytes, { headers: { 'content-type': 'image/png', ...(oversized ? { 'content-length': String(4 * 1024 * 1024) } : {}) } });
    throw new Error('Unexpected network destination');
  };
  try {
    const client = createVimeoClient({ fetchImpl, directory, token: 'test-token' });
    const source = await client.catalog();
    assert.deepEqual(source.rows.map(v => v.id), [101, 202], 'Every API page is imported');
    assert.equal(calls.filter(c => c.url.hostname === 'api.vimeo.com').length, 2);
    for (const row of source.rows) {
      const name = row.thumbnail_url.split('/').pop();
      assert.ok(thumbnailName.test(name));
      assert.deepEqual(await fs.readFile(path.join(directory, name)), bytes);
      assert.ok(row.thumbnail_url.startsWith('/dong-tien/api/learning/thumbnails/'));
    }
    for (const { url, options } of calls) {
      assert.equal(options.redirect, 'error');
      assert.equal(options.body, undefined);
      if (url.hostname === 'api.vimeo.com') assert.equal(options.headers.Authorization, 'Bearer test-token');
      else assert.equal(options.headers, undefined, 'No API authorization is sent to the thumbnail CDN');
    }
    await client.thumbnail('303/privatehash');
    await assert.rejects(() => client.thumbnail('303/privatehash', 'https://external.invalid/image.jpg'), e => e.status === 502);
    assert.ok(calls.every(c => c.url.hostname !== 'external.invalid'));
    badNext = true;
    await assert.rejects(() => client.catalog(), e => e.status === 502);
    badNext = false; oversized = true;
    await assert.rejects(() => client.thumbnail('404', 'https://i.vimeocdn.com/video/404.png'), e => e.status === 502);
    console.log('PASS: all Vimeo API pages, unlisted privacy hashes, local immutable thumbnails, restricted network destinations, no auth/learner data to image CDN, and image size limits.');
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'dong-tien-vimeo-')));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
