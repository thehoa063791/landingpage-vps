// node scripts/test-attribution.cjs — first/last touch (src/attribution.js): what counts as a
// touch, cookie rules (first once, last only for non-direct visits, whole set replaced),
// the Express middleware, touches read at registration, webhook fields.
const assert = require('node:assert/strict');
const express = require('express');
const { touchFrom, cookiesFor, touchesFor, readTouch, parseCookies, flatTouch, middleware } = require('../src/attribution');
const { buildWebhookPayload } = require('../src/webhooks');

const now = new Date('2026-10-22T03:00:00.000Z');
const value = header => decodeURIComponent(header.split(';')[0].split('=').slice(1).join('='));

(async () => {
  // ── What a touch is ──
  assert.deepEqual(touchFrom({ query: { utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'k80' }, path: '/richlife', now }),
    { source: 'facebook', medium: 'cpc', campaign: 'k80', landing_path: '/richlife', at: now.toISOString() });
  assert.deepEqual(touchFrom({ query: { gbraid: 'G1' }, path: '/trading', now }), { source: 'google', medium: 'cpc', click_ids: { gbraid: 'G1' }, landing_path: '/trading', at: now.toISOString() }, 'A click ID alone names the source');
  assert.deepEqual(touchFrom({ query: { fbclid: 'F1' }, referer: 'https://l.facebook.com/l.php', path: '/', now }), { source: 'facebook', medium: 'cpc', click_ids: { fbclid: 'F1' }, referrer_host: 'l.facebook.com', landing_path: '/', at: now.toISOString() });
  assert.equal(touchFrom({ referer: 'https://www.google.com/', path: '/', now }).medium, 'organic', 'Search engine = organic');
  assert.deepEqual(['source', 'medium'].map(k => touchFrom({ referer: 'https://zalo.me/g/abc', path: '/', now })[k]), ['zalo', 'referral']);
  assert.equal(touchFrom({ path: '/', now }), null, 'Direct visit: no touch');
  assert.equal(touchFrom({ referer: 'https://event.phamthanhbien.com/trading', path: '/zoom', now }), null, 'Our own pages are not a source');
  assert.equal(touchFrom({ referer: 'https://phamthanhbien.com/', path: '/ve-toi', now }), null);
  assert.ok(!JSON.stringify(touchFrom({ query: { utm_source: 'x', email: 'a@b.vn' }, path: '/trading', now })).includes('a@b.vn'), 'No personal data in a touch');

  // ── Cookie rules ──
  const base = { host: 'event.phamthanhbien.com', secure: true, path: '/richlife', now };
  let set = cookiesFor({ ...base, query: {}, referer: '', cookies: {} });
  assert.equal(set.length, 1, 'Direct first visit: first touch only');
  assert.match(set[0], /^ptb_ft=.*; Path=\/; Max-Age=31536000; SameSite=Lax; Domain=\.phamthanhbien\.com; Secure$/);
  assert.equal(readTouch(set[0].split(';')[0].split('=').slice(1).join('=')).source, '(direct)');
  set = cookiesFor({ ...base, query: { utm_source: 'facebook', utm_campaign: 'k80' }, referer: '', cookies: {} });
  assert.deepEqual(set.map(c => c.split('=')[0]), ['ptb_ft', 'ptb_lt'], 'First campaign visit: both');
  assert.match(set[1], /Max-Age=7776000/);
  const ft = set[0].split(';')[0].split('=').slice(1).join('=');
  set = cookiesFor({ ...base, query: {}, referer: '', cookies: { ptb_ft: ft } });
  assert.deepEqual(set, [], 'Later direct visit: nothing changes (last touch kept)');
  set = cookiesFor({ ...base, query: { utm_source: 'zalo' }, referer: '', cookies: { ptb_ft: ft } });
  assert.deepEqual(set.map(c => c.split('=')[0]), ['ptb_lt'], 'Later campaign: last touch only, first kept');
  assert.deepEqual(JSON.parse(value(set[0])), { source: 'zalo', landing_path: '/richlife', at: now.toISOString(), medium: '' }, 'Whole set replaced: no campaign left over from facebook');
  assert.ok(!cookiesFor({ ...base, host: 'localhost:3000', query: { utm_source: 'x' }, referer: '', cookies: {} })[0].includes('Domain='), 'No shared domain on other hosts');

  // ── Express middleware ──
  const app = express();
  app.use(middleware());
  app.get('*', (req, res) => res.send('ok'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base_ = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(`${base_}/richlife?utm_source=facebook`, { headers: { Accept: 'text/html' } });
    assert.deepEqual(page.headers.getSetCookie().map(c => c.split('=')[0]), ['ptb_ft', 'ptb_lt']);
    for (const path of ['/api/register', '/admin/', '/p/richlife/style.css']) {
      const res = await fetch(`${base_}${path}?utm_source=facebook`, { headers: { Accept: 'text/html' } });
      assert.deepEqual(res.headers.getSetCookie(), [], `${path}: not a page load`);
    }
  } finally { server.close(); }

  // ── At registration ──
  const lt = encodeURIComponent(JSON.stringify({ source: 'zalo', medium: 'referral', at: '2026-10-21T00:00:00.000Z' }));
  let touches = touchesFor({ headers: { cookie: `a=1; ptb_ft=${ft}; ptb_lt=${lt}` } }, { utm_source: 'ignored' });
  assert.deepEqual([touches.first_touch.source, touches.last_touch.source], ['facebook', 'zalo']);
  touches = touchesFor({ headers: {} }, { utm_source: 'google', utm_campaign: 'brand', event_source_url: 'https://event.phamthanhbien.com/richlife?x=1' });
  assert.deepEqual([touches.first_touch.source, touches.last_touch.campaign, touches.last_touch.landing_path], ['google', 'brand', '/richlife'], 'No cookies: the form UTM, as before');
  touches = touchesFor({ headers: { cookie: `ptb_ft=${ft}` } }, {});
  assert.equal(touches.last_touch.source, 'facebook', 'No last touch: the first');
  assert.deepEqual(touchesFor({ headers: {} }, {}), { first_touch: null, last_touch: null });
  assert.deepEqual(parseCookies('a=1; b = 2'), { a: '1', b: '2' });

  // ── Webhook: new fields only, existing ones unchanged ──
  const payload = buildWebhookPayload({ id: 'r1', page_id: 'richlife', name: 'A', utm_source: 'zalo', first_touch: readTouch(ft), last_touch: readTouch(lt) });
  assert.deepEqual([payload.utm_source, payload.ft_source, payload.ft_campaign, payload.lt_source, payload.lt_medium, payload.event, payload.event_id], ['zalo', 'facebook', 'k80', 'zalo', 'referral', 'new_registration', 'r1']);
  assert.equal(buildWebhookPayload({ id: 'r2' }).ft_source, '', 'Leads without touches: empty strings');
  assert.deepEqual(Object.keys(flatTouch('ft', null)), ['ft_source', 'ft_medium', 'ft_campaign', 'ft_content', 'ft_term', 'ft_landing_path', 'ft_referrer_host', 'ft_at']);
  // ── public/js/funnel-tracker.js: one attribution set, cookie fallback ──
  const vm = require('node:vm');
  const trackerSource = require('node:fs').readFileSync(require('node:path').join(__dirname, '../public/js/funnel-tracker.js'), 'utf8');
  function runTracker(url, storage, cookieJar) {
    const store = { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); }, removeItem: k => { delete storage[k]; } };
    const document = { currentScript: { dataset: { funnel: 'richlife-short', step: 'home' } }, referrer: '', title: '', addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
      get cookie() { return cookieJar.join('; '); }, set cookie(v) { cookieJar.push(v.split(';')[0]); } };
    const context = { document, location: new URL(url), sessionStorage: store, navigator: { sendBeacon: () => true }, fetch: async () => ({}), crypto: { randomUUID: () => 'id' },
      URLSearchParams, URL, Blob: class {}, setTimeout, clearTimeout, setInterval: () => 0, console, addEventListener() {}, removeEventListener() {}, dataLayer: [], history: { pushState() {}, replaceState() {} } };
    context.window = context;
    vm.runInNewContext(trackerSource, context);
    return context.FunnelTracking.context();
  }
  const tab = {};
  let ctx = runTracker('https://event.phamthanhbien.com/richlife?utm_source=facebook&utm_campaign=k80&utm_content=video2', tab, []);
  assert.deepEqual([ctx.utm_source, ctx.utm_campaign, ctx.utm_content], ['facebook', 'k80', 'video2']);
  ctx = runTracker('https://event.phamthanhbien.com/richlife?utm_source=zalo', tab, []);
  assert.deepEqual([ctx.utm_source, ctx.utm_campaign, ctx.utm_content], ['zalo', '', ''], 'A new link replaces the whole set: no k80/video2 left over');
  ctx = runTracker('https://event.phamthanhbien.com/richlife', tab, []);
  assert.equal(ctx.utm_source, 'zalo', 'Same tab, no parameters: the tab keeps its set');
  const jar = [`ptb_lt=${encodeURIComponent(JSON.stringify({ source: 'facebook', medium: 'cpc', campaign: 'k80', click_ids: { fbclid: 'F1' }, at: now.toISOString() }))}`];
  ctx = runTracker('https://event.phamthanhbien.com/richlife', {}, jar);
  assert.deepEqual([ctx.utm_source, ctx.utm_campaign, ctx.fbclid], ['facebook', 'k80', 'F1'], 'New tab / direct return: the last touch cookie');
  ctx = runTracker('https://event.phamthanhbien.com/richlife?gbraid=G9', {}, []);
  assert.equal(ctx.gbraid, 'G9', 'gbraid captured');

  console.log('PASS: touches (UTM, click IDs incl. wbraid/gbraid, referrers, own site and direct ignored, no personal data), first touch once / last touch non-direct whole set, cookie scope, page-load middleware, touches at registration with form fallback, additive webhook fields.');
})().catch(error => { console.error(error); process.exit(1); });
