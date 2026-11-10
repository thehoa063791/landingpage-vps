// node scripts/test-fakeout.cjs [--screenshots <dir>] — Fakeout Trading (a copy of /breakout, Hà Nội only):
// real /api/register + /api/checkout + pages router on in-memory storage, landing → QR → thank-you in Chromium.
// Nothing leaves the machine: CAPI/webhooks are recorded, external requests blocked.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..');
const leads = [], orders = [], notes = [], sent = [];
const storage = {
  supabase: { from: () => { throw new Error('no database in this test'); } },
  getRegistrations: async () => leads,
  getCrmSetting: async (key, fallback) => fallback,
  findRegistrationsByEmail: async email => leads.filter(l => String(l.email || '').trim().toLowerCase() === String(email || '').trim().toLowerCase()),
  findRegistrationsByPhone: async phone => leads.filter(l => String(l.phone || '').replace(/\D/g, '').slice(-9) === String(phone || '').replace(/\D/g, '').slice(-9)),
  getRegistrationById: async id => leads.find(lead => lead.id === id) || null,
  insertRegistration: async row => { leads.push({ ...row }); },
  updateRegistration: async (id, updates) => { Object.assign(leads.find(lead => lead.id === id), updates); },
  tagLeadByPage: async () => {},
  insertEvent: async () => {},
  countRegistrationsByPage: async () => 0,
  insertSurvey: async () => {},
  addLeadNote: async (registrationId, body) => { notes.push({ registrationId, body }); },
  getFunnelOrders: async id => orders.filter(order => order.registration_id === id),
  getFunnelOrder: async id => orders.find(order => order.id === id) || null,
  getFunnelOrderByPaymentRef: async ref => orders.find(order => order.payment_ref === ref) || null,
  createFunnelOrder: async row => { const order = { id: `order-${orders.length + 1}`, ...row, status_history: [] }; orders.push(order); return order; },
  updateFunnelOrder: async (id, updates, actor = {}) => {
    const order = orders.find(item => item.id === id);
    if (updates.status && updates.status !== order.status) order.status_history.push({ from: order.status, to: updates.status, by: actor.email || '' });
    return Object.assign(order, updates);
  },
};
const stub = (file, exports) => { require.cache[require.resolve(path.join(root, file))] = { id: file, filename: file, loaded: true, exports }; };
stub('src/storage.js', storage);
stub('src/metaCapi.js', { sendRegistrationEvents: async (req, record) => { sent.push(['capi', record.page_id]); }, sendTrackEvent: async () => {} });
stub('src/webhooks.js', { buildWebhookPayload: record => ({ event: 'new_registration', email: record.email, page_id: record.page_id }), fireWebhooks: async payload => { sent.push(['webhook', payload]); }, hubcrmTracking: () => ({}) });
stub('src/emailValidation.js', { rejection: async email => email.startsWith('bad') ? { message: 'Email này không tồn tại.', suggestion: '' } : null });
const utils = require('../src/utils');
stub('src/utils.js', { ...utils, lookupGeo: async () => null });

const { regionOpen, PAID_FUNNELS } = require('../src/bankTransfer');

// Chromium sometimes refuses a full-page capture right after load; wait and retry once.
async function main() {
  const funnel = PAID_FUNNELS.fakeout;
  assert.deepEqual(Object.keys(funnel.regions), ['Hà Nội']);
  assert.equal(regionOpen(funnel, 'Hà Nội', new Date('2026-12-05T23:59:00+07:00')), true);
  assert.equal(regionOpen(funnel, 'Hà Nội', new Date('2026-12-06T00:00:00+07:00')), false);
  assert.equal(regionOpen(funnel, 'TP. Hồ Chí Minh', new Date('2026-11-10T00:00:00+07:00')), false);
  const realDate = funnel.regions['Hà Nội'].starts_on;
  funnel.regions['Hà Nội'].starts_on = '2099-01-01'; // the server's clock is real; the browser's is fixed below

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(root, 'public')));
  const funnelAssets = express.static(path.join(root, 'pages'), { index: false, redirect: false });
  app.use('/p', (req, res, next) => /\.html$/i.test(req.path) ? next() : funnelAssets(req, res, next));
  app.use('/api', require('../src/routes/api'));
  app.use('/', require('../src/routes/pages'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const shots = process.argv.includes('--screenshots') ? process.argv[process.argv.indexOf('--screenshots') + 1] : '';
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.clock.setFixedTime(new Date('2026-11-10T10:00:00+07:00'));
    await context.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/fakeout?utm_source=test`);
    assert.match(await page.title(), /Fakeout Trading/);
    assert.equal(await page.textContent('h1').then(t => t.trim()), 'Fakeout Trading');
    assert.ok(!/breakout/i.test(await page.content()), 'nothing still says Breakout');

    // Hà Nội 06/12; TP. HCM not open, on the page, in the form and on the server.
    const venues = page.locator('.venue');
    assert.match(await venues.nth(0).textContent(), /06\.12\.2026/);
    assert.match(await venues.nth(1).textContent(), /Chưa mở/);
    assert.match(await venues.nth(1).textContent(), /Sẽ cập nhật sau nếu có/);
    assert.equal(await venues.nth(1).locator('a').count(), 0);
    assert.equal(await page.isDisabled('input[value="TP. Hồ Chí Minh"]'), true);
    assert.match(await page.textContent('label.region.closed'), /Chưa mở/);
    assert.equal(await page.isDisabled('input[value="Hà Nội"]'), false);
    const refused = await page.evaluate(async () => {
      const response = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'A', phone: '0901234567', email: 'hcm@example.invalid', page_id: 'fakeout', region: 'TP. Hồ Chí Minh' }) });
      return response.status;
    });
    assert.equal(refused, 400);
    assert.equal(leads.length, 0);
    if (shots) await page.screenshot({ path: path.join(shots, 'fakeout-desktop.png'), fullPage: true });

    await page.fill('#name', 'Nguyễn Văn Test');
    await page.fill('#phone', '0901 234 567');
    await page.fill('#email', 'test@example.invalid');
    await page.click('label.region:has-text("Hà Nội")');
    await page.click('#registration-form button[type="submit"]');
    await page.waitForURL(/\/fakeout\/thanh-toan$/);
    assert.equal(leads[0].page_id, 'fakeout');
    assert.equal(leads[0].region, 'Hà Nội');
    assert.match(orders[0].payment_ref, /^FK[A-Z2-9]{6}$/);
    assert.equal(orders[0].amount, 99000);
    assert.equal(await page.evaluate(() => localStorage.getItem('fakeout:ref')), orders[0].payment_ref);
    await page.waitForSelector('#pay-card:not([hidden])');
    assert.match(await page.textContent('#pay-lead'), /Fakeout Trading · Hà Nội · 06\/12\/2026/);
    await page.click('#confirm');
    await page.waitForURL(/\/fakeout\/thank-you-hn$/);
    assert.match(await page.textContent('.thank-info'), /06\.12\.2026/);
    assert.equal(await page.getAttribute('.zalo-button', 'href'), 'https://zalo.me/g/jdrqvxckc3g3t3obbdc0');
    assert.ok(!/breakout/i.test(await page.content()), 'nothing still says Breakout');
    if (shots) await page.screenshot({ path: path.join(shots, 'fakeout-thanks.png'), fullPage: true });

    // After the Hà Nội day the whole form closes; TP. HCM keeps saying it is not open.
    await context.clock.setFixedTime(new Date('2026-12-07T09:00:00+07:00'));
    await page.goto(`${base}/fakeout`);
    await page.waitForSelector('#form-closed:not([hidden])');
    assert.match(await page.textContent('label.region:has-text("Hà Nội")'), /Đã đóng đăng ký/);
    assert.match(await page.textContent('label.region:has-text("TP. Hồ Chí Minh")'), /Chưa mở/);

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await phone.clock.setFixedTime(new Date('2026-11-10T10:00:00+07:00'));
    await phone.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    const mobile = await phone.newPage();
    await mobile.goto(`${base}/fakeout`);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    if (shots) await mobile.screenshot({ path: path.join(shots, 'fakeout-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: Fakeout landing, Hà Nội only, TP. HCM not open, QR payment, thank-you, closing');
  } finally {
    funnel.regions['Hà Nội'].starts_on = realDate;
    await browser.close();
    server.close();
  }
  process.exit(0);
}

main().catch(error => { console.error(error); process.exit(1); });
