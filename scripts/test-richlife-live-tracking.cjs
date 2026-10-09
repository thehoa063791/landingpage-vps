const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('pages/richlife-live/conversion.js', 'utf8');
function boot(store = new Map(), ready = true, step = 'home') {
  const pixels = [], requests = [];
  const context = { Date, JSON, Promise, setTimeout: fn => { fn(); },
    sessionStorage: { getItem: k => store.get(k), setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) },
    __META_BROWSER_PIXEL: { initialized: ready }, fbq: (...args) => pixels.push(args),
    FunnelTracking: { step, context: () => ({ utm_source: 'facebook', session_id: 'session-1' }) },
    fetch: (...args) => requests.push(args), dataLayer: [] };
  context.window = context;
  vm.runInNewContext(source, context);
  return { context, pixels, requests, store };
}
(async () => {
  const a = boot();
  await a.context.RichlifeLiveConversion.registered({ event_id: 'lead-1' });
  assert.equal(a.pixels.length, 1);
  assert.equal(a.pixels[0][1], 'CompleteRegistration');
  assert.equal(a.pixels[0][3].eventID, 'lead-1');
  assert.equal(a.context.dataLayer[0].event, 'generate_lead');
  assert.equal(a.context.dataLayer[0].utm_source, 'facebook');
  assert.equal(a.requests.length, 0, 'no second server conversion');
  await a.context.RichlifeLiveConversion.registered({ event_id: 'lead-2', duplicate: true });
  assert.equal(a.pixels.length, 1);
  const b = boot(a.store, true, 'thank-you');
  await Promise.resolve();
  assert.equal(b.pixels.length, 0, 'no replay on thank-you');
  const c = boot(new Map(), false);
  await c.context.RichlifeLiveConversion.registered({ event_id: 'lead-pending' });
  assert.equal(c.pixels.length, 0, 'disabled/uninitialized Pixel does not fire');
  const d = boot(c.store, true, 'thank-you');
  await Promise.resolve();
  assert.equal(d.pixels[0][3].eventID, 'lead-pending');
  const expired = boot(new Map([['richlife-live:pending-conversion', JSON.stringify({id:'old',at:Date.now()-300001})]]), true, 'thank-you');
  assert.equal(expired.pixels.length, 0);
  console.log('PASS: Live conversion ID, GTM attribution, duplicate guard, configuration guard, thank-you recovery and expiration.');
})().catch(error => { console.error(error); process.exitCode = 1; });

