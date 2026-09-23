const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('pages/hoc-trading/registration.js', 'utf8');
function boot(options = {}) {
  const calls = [], store = new Map(), redirects = [], events = [];
  const context = {
    AbortController, Date, JSON, setTimeout, clearTimeout,
    sessionStorage: { getItem: k => store.get(k), setItem(k, v) { if (options.blocked) throw Error('blocked'); store.set(k, v); } },
    location: { href: 'https://example.test/hoc-trading?utm_source=test', assign: url => redirects.push(url) },
    HocTradingTracking: { context: () => ({ utm_source: 'test', fbp: 'fb.1.test', session_id: 'session' }), track: e => events.push(e), registered: async data => events.push(data.event_id) },
    fetch: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: !options.fail, json: async () => options.fail ? { success: false, message: 'Save failed' } : { success: true, event_id: 'saved-id' } }; },
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return { api: context.HocTradingRegistration, calls, store, redirects, events };
}
(async () => {
  const fields = { name: ' Test User ', phone: '0901234567', email: 'TEST@example.com' };
  const a = boot();
  await assert.rejects(a.api.submit({ ...fields, phone: 'abc123' }));
  assert.equal(a.calls.length, 0);
  await Promise.all([a.api.submit(fields), a.api.submit(fields)]);
  assert.equal(a.calls.length, 1);
  assert.equal(a.calls[0].url, '/api/register');
  assert.equal(a.calls[0].body.page_id, 'hoc-trading');
  assert.equal(a.calls[0].body.email, 'test@example.com');
  assert.equal(a.calls[0].body.utm_source, 'test');
  assert.equal(a.calls[0].body.value, 0);
  assert.equal(a.api.receipt().id, 'saved-id');
  assert.deepEqual(a.redirects, ['/thank-you-hoc-trading']);
  const b = boot({ fail: true });
  await assert.rejects(b.api.submit(fields), /Save failed/);
  assert.equal(b.api.receipt(), null);
  assert.equal(b.redirects.length, 0);
  assert.ok(!b.events.includes('saved-id'));
  const c = boot({ blocked: true });
  await c.api.submit(fields);
  assert.equal(c.redirects.length, 1);
  for (const file of ['home.html', 'register-sucess.html']) {
    const html = fs.readFileSync('pages/hoc-trading/' + file, 'utf8');
    new vm.Script(html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/)[1]);
    for (const [, asset] of html.matchAll(/(?:src="|url\(['"]?)(\/p\/hoc-trading\/[^'" )]+)/g)) {
      assert.ok(fs.existsSync('pages/' + asset.slice(3)), asset);
    }
  }
  console.log('PASS: validation, single submission, registration payload, server failure, receipt, blocked storage, clean redirect, component syntax and local assets.');
})().catch(error => { console.error(error); process.exitCode = 1; });
