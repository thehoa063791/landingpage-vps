const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/js/meta-pixel.js', 'utf8');

async function boot(enabled = true, spa = false) {
  const events = [], timers = [], listeners = {};
  const context = {
    console, Set, Math, Date,
    location: { pathname: '/trading' },
    sessionStorage: { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } },
    document: { readyState: 'complete', currentScript: { dataset: { spa: String(spa) } }, documentElement: { scrollHeight: 2000 }, body: { scrollHeight: 2000 }, addEventListener() {}, removeEventListener() {} },
    performance: { now: () => 2000 },
    innerHeight: 1000, scrollY: 0,
    addEventListener: (name, fn) => { listeners[name] = fn; },
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); },
    clearTimeout() {}, removeEventListener() {},
    fetch: async () => ({ ok: true, json: async () => ({ enabled, pixel_id: 'TEST' }) }),
    fbq: (...args) => events.push(args),
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { context, events, timers, listeners };
}

(async () => {
  const { browserTrackingConfig } = require('../src/trackingConfig');
  const keys = ['META_DATASET_ID', 'META_BROWSER_PIXEL_ENABLED', 'META_CAPI_ENABLED', 'GOOGLE_TAG_ENABLED'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.META_DATASET_ID = 'TEST';
    process.env.META_CAPI_ENABLED = 'false';
    process.env.META_BROWSER_PIXEL_ENABLED = 'true';
    assert.equal(browserTrackingConfig().enabled, true, 'Browser Pixel is independent of server CAPI');
    process.env.META_BROWSER_PIXEL_ENABLED = 'false';
    assert.equal(browserTrackingConfig().enabled, false);
    process.env.GOOGLE_TAG_ENABLED = 'false';
    assert.equal(browserTrackingConfig().gtm_id, '');
    assert.equal(browserTrackingConfig().ga_measurement_id, '');
    assert.deepEqual(Object.keys(browserTrackingConfig()).sort(), ['enabled', 'ga_measurement_id', 'gtm_id', 'pixel_id']);
  } finally {
    for (const key of keys) if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
  }
  const a = await boot();
  assert.equal(a.events.filter(e => e[1] === 'PageView').length, 1);
  assert.deepEqual(a.timers.map(t => t.delay), [8000, 28000, 58000, 88000, 118000, 178000, 298000]);
  for (const timer of a.timers) { timer.fn(); timer.fn(); }
  for (const seconds of [10, 30, 60, 90, 120, 180, 300]) {
    const matching = a.events.filter(e => e[1] === `TimeOnPage_${seconds}_seconds`);
    assert.equal(matching.length, 1);
    assert.equal(matching[0][0], 'trackCustom');
    assert.ok(matching[0][3].eventID);
  }
  a.context.scrollY = 250;
  a.listeners.scroll();
  assert.equal(a.events.filter(e => /^ScrollDepth_/.test(e[1])).length, 1);
  a.context.scrollY = 999.5;
  a.listeners.scroll(); a.listeners.scroll(); a.listeners.resize();
  for (const depth of [25, 50, 75, 100]) {
    assert.equal(a.events.filter(e => e[1] === `ScrollDepth_${depth}_percent`).length, 1);
  }
  vm.runInContext(source, a.context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(a.timers.length, 7);
  assert.equal(a.events.filter(e => e[1] === 'PageView').length, 1);
  const disabled = await boot(false);
  assert.equal(disabled.events.length, 0);
  assert.equal(disabled.timers.length, 0);
  const short = await boot();
  short.context.document.documentElement.scrollHeight = 1000;
  short.context.document.body.scrollHeight = 1000;
  short.listeners.scroll();
  assert.equal(short.events.filter(e => /^ScrollDepth_/.test(e[1])).length, 0);
  const routed = await boot(true, true);
  assert.equal(routed.events.filter(e => e[1] === 'PageView').length, 0, 'SPA views are owned by the shared route tracker');
  routed.context.__META_BROWSER_PIXEL.navigate('dong-tien', 'landing_page');
  assert.deepEqual(routed.timers.map(t => t.delay), [10000, 30000, 60000, 90000, 120000, 180000, 300000]);
  const oldTimers = [...routed.timers];
  oldTimers[0].fn(); oldTimers[0].fn();
  assert.equal(routed.events.filter(e => e[1] === 'TimeOnPage_10_seconds').length, 1);
  routed.context.__META_BROWSER_PIXEL.navigate('dong-tien', 'lesson');
  for (const timer of oldTimers) timer.fn();
  assert.equal(routed.events.filter(e => /^TimeOnPage_/.test(e[1])).length, 1, 'Timers from a previous route are cancelled');
  for (const timer of routed.timers.slice(7)) { timer.fn(); timer.fn(); }
  const lessonEvents = routed.events.filter(e => e[2]?.content_category === 'lesson');
  assert.equal(lessonEvents.length, 7);
  routed.listeners.scroll({ target: { scrollHeight: 1500, clientHeight: 500, scrollTop: 1000 } });
  assert.equal(routed.events.filter(e => /^ScrollDepth_/.test(e[1])).length, 4, 'Nested learning scroll containers emit all canonical milestones');
  console.log('PASS: all 11 browser engagement events, SPA timer reset/cancellation and nested scroll, navigation timing, once per page, duplicate loader, disabled Pixel, blocked storage and non-scrollable page.');
})().catch(error => { console.error(error); process.exitCode = 1; });
