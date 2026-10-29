const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createVimeoClient, parseVideo, thumbnailName } = require('../src/learningVimeo');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dong-tien-vimeo-'));
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6tSIAAAAASUVORK5CYII=', 'base64');
  const calls = [];
  const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  let oversized = false;
  const fetchImpl = async (address, options) => {
    const url = new URL(address); calls.push({ url, options });
    if (url.pathname === '/api/oembed.json') {
      const video = new URL(url.searchParams.get('url')).pathname.slice(1);
      if (video.startsWith('404')) return reply({}, 404);
      if (video === '303') return reply({ title: 'Unlisted lesson', duration: 754, html: '<iframe src="https://player.vimeo.com/video/303?h=privatehash&amp;app_id=1"></iframe>', thumbnail_url: 'https://i.vimeocdn.com/video/303.png' });
      return reply({ title: ` Lesson ${video} `, duration: 99.6, html: '', thumbnail_url: 'https://i.vimeocdn.com/video/1.png' });
    }
    if (url.hostname === 'api.vimeo.com') return reply({ name: 'Private lesson', duration: 120, link: 'https://vimeo.com/404404/abcdef1234' });
    if (url.hostname === 'i.vimeocdn.com') return new Response(bytes, { headers: { 'content-type': 'image/png', ...(oversized ? { 'content-length': String(4 * 1024 * 1024) } : {}) } });
    throw new Error('Unexpected network destination');
  };
  try {
    // Accepted link forms and rejected ones.
    for (const [input, video] of [
      ['1215059176', '1215059176'], ['1215059176/69cafdd8c4', '1215059176/69cafdd8c4'], [' https://vimeo.com/1215059176/69cafdd8c4 ', '1215059176/69cafdd8c4'],
      ['vimeo.com/1215059176', '1215059176'], ['https://player.vimeo.com/video/1215059176?h=69cafdd8c4&badge=0', '1215059176/69cafdd8c4'],
      ['<iframe src="https://player.vimeo.com/video/1215059176?badge=0&amp;h=69cafdd8c4" frameborder="0"></iframe>', '1215059176/69cafdd8c4'],
      ['https://vimeo.com/manage/videos/1215059176/69cafdd8c4', '1215059176/69cafdd8c4'], ['https://vimeo.com/channels/staffpicks/123456789', '123456789'],
      ['https://vimeo.com/reviews/27825fe4-1d85-4f05-8fb4-13ba87f1008a/users/208230075/folders/29758694', null], ['https://evil.invalid/123456789', null],
      ['https://vimeo.com.evil.invalid/123456789', null], ['javascript:alert(1)', null], ['', null], ['0', null],
    ]) assert.equal(parseVideo(input), video, input);

    const client = createVimeoClient({ fetchImpl, directory, token: '', referer: 'https://event.example.invalid' });
    assert.deepEqual(await client.lookup('https://vimeo.com/101'), { vimeo_video_id: '101', title: 'Lesson 101', duration: 100 });
    assert.deepEqual(await client.lookup('https://vimeo.com/303'), { vimeo_video_id: '303/privatehash', title: 'Unlisted lesson', duration: 754 }, 'The privacy hash comes from the embed code');
    await assert.rejects(() => client.lookup('https://example.invalid/101'), e => e.status === 400);
    await assert.rejects(() => client.lookup('404404'), e => e.status === 502 && /riêng tư/.test(e.message));
    assert.equal(calls.find(c => c.url.pathname === '/api/oembed.json').options.headers.Referer, 'https://event.example.invalid', 'Domain-restricted videos answer with the site Referer');
    // With an account token, private videos are read from the API.
    const withToken = createVimeoClient({ fetchImpl, directory, token: 'test-token' });
    assert.deepEqual(await withToken.lookup('404404'), { vimeo_video_id: '404404/abcdef1234', title: 'Private lesson', duration: 120 });
    assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer test-token');

    const thumbnail = await client.thumbnail('303/privatehash');
    assert.ok(thumbnailName.test(thumbnail.split('/').pop()));
    assert.ok(thumbnail.startsWith('/dong-tien/api/learning/thumbnails/303-'));
    assert.deepEqual(await fs.readFile(path.join(directory, thumbnail.split('/').pop())), bytes);
    for (const { url, options } of calls) {
      assert.equal(options.redirect, 'error');
      assert.equal(options.body, undefined);
      if (url.hostname !== 'api.vimeo.com') assert.equal(options.headers?.Authorization, undefined, 'The token goes to the Vimeo API only');
    }
    await assert.rejects(() => client.thumbnail('303/privatehash', 'https://external.invalid/image.jpg'), e => e.status === 502);
    assert.ok(calls.every(c => c.url.hostname !== 'external.invalid'));
    oversized = true;
    await assert.rejects(() => client.thumbnail('404', 'https://i.vimeocdn.com/video/404.png'), e => e.status === 502);
    // Uploaded images: checked by their first bytes, stored under the lesson ID.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6tSIAAAAASUVORK5CYII=', 'base64');
    const own = await client.upload(42, png);
    assert.match(own, /^\/dong-tien\/api\/learning\/thumbnails\/42-[a-f0-9]{16}\.png$/);
    assert.deepEqual(await fs.readFile(path.join(directory, own.split('/').pop())), png);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]);
    assert.match(await client.upload(42, webp), /\.webp$/);
    assert.match(await client.upload(42, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])), /\.jpg$/);
    await assert.rejects(() => client.upload(42, Buffer.from('<svg onload=alert(1)>')), e => e.status === 400, 'Not an image by its bytes');
    await assert.rejects(() => client.upload(42, Buffer.alloc(3 * 1024 * 1024 + 1, 0xff)), e => e.status === 400, 'Over 3 MB');
    await assert.rejects(() => client.upload('../x', png), e => e.status === 400);
    console.log('PASS: Vimeo link parsing, title/duration/privacy hash lookup, token fallback for private videos, local immutable thumbnails, uploaded images checked by their bytes, restricted network destinations and image size limits.');
  } finally {
    assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'dong-tien-vimeo-')));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
