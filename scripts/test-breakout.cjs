// node scripts/test-breakout.cjs [--screenshots <dir>] — Breakout Trading paid funnel:
// bank-transfer orders (src/bankTransfer.js), the real /api/register + /api/checkout routes
// and pages router on in-memory storage, then landing → QR payment → regional thank-you
// in Chromium. Nothing leaves the machine: CAPI/webhooks are recorded, external requests blocked.
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

const { createBankTransferService, qrUrl, regionOpen, transferContent, PAID_FUNNELS } = require('../src/bankTransfer');

// Chromium sometimes refuses a full-page capture right after load; wait and retry once.
async function shot(page, file) {
  await page.waitForLoadState('networkidle').catch(() => {});
  try { await page.screenshot({ path: file, fullPage: true }); } catch {
    await page.waitForTimeout(800);
    await page.screenshot({ path: file, fullPage: true });
  }
}

async function serviceChecks() {
  const service = createBankTransferService({ storage });
  const lead = { id: 'lead-unit', page_id: 'breakout', email: 'unit@example.invalid', region: 'Hà Nội', registered_at: '2026-10-21T00:00:00.000Z' };
  leads.push(lead);
  const order = await service.createOrder(lead, PAID_FUNNELS.breakout);
  assert.match(order.payment_ref, /^BT[A-Z2-9]{6}$/);
  assert.equal(order.amount, 99000);
  const view = await service.describe(order);
  assert.equal(view.status, 'pending');
  assert.equal(view.thank_you_url, '/breakout/thank-you-hn');
  assert.equal(view.qr_url, qrUrl(99000, order.payment_ref));
  assert.ok(view.qr_url.includes('970436-0451000368876') && view.qr_url.includes(`addInfo=${order.payment_ref}`) && view.qr_url.includes('amount=99000'));
  assert.ok(!JSON.stringify(view).includes('unit@example.invalid'), 'public view carries no email');
  assert.deepEqual((await service.findActiveOrder('breakout', ' UNIT@example.invalid ')).order, order);

  // SePay: outgoing, unknown code and short amounts never mark an order paid.
  assert.equal((await service.recordBankTransfer({ transferType: 'out', content: order.payment_ref, transferAmount: 99000 })).reason, 'outgoing');
  assert.equal((await service.recordBankTransfer({ transferType: 'in', content: 'chuyen tien', transferAmount: 99000 })).reason, 'no_match');
  // Transfer content: ASCII name + phone, at most 25 characters (VietQR field limit).
  assert.equal(transferContent('Đạt Lưu Thành', '+84978102096'), 'DAT LUU THANH 0978102096');
  assert.equal(transferContent('Nguyễn Văn Thành', '0901 234 567'), 'N VAN THANH 0901234567');
  for (const name of ['Nguyễn Thị Phương Thảo Linh', 'Tôn Nữ Hoàng Bảo Ngọc Anh Thư', 'A'.repeat(60)]) {
    const text = transferContent(name, '0912345678');
    assert.ok(text.length <= 25 && text.endsWith(' 0912345678'), text);
  }
  assert.equal((await service.recordBankTransfer({ id: 1, transferType: 'in', content: `MBVCB.123 ${order.payment_ref} FT2610`, transferAmount: 50000 })).reason, 'amount_short');
  assert.equal(order.status, 'pending');
  assert.ok(notes.at(-1).body.includes('thiếu'));
  const applied = await service.recordBankTransfer({ id: 2, transferType: 'in', content: `IBFT ${order.payment_ref.toLowerCase()} chuyen khoan`, transferAmount: 99000 });
  assert.equal(applied.applied, true);
  assert.equal(order.status, 'won');
  assert.ok(order.sold_at);
  assert.deepEqual(order.status_history.at(-1), { from: 'pending', to: 'won', by: 'sepay' });
  assert.equal((await service.recordBankTransfer({ id: 2, transferType: 'in', content: order.payment_ref, transferAmount: 99000 })).already_paid, true);
  assert.equal((await service.describe(order)).status, 'paid');
  const buyer = { id: 'lead-phone', page_id: 'breakout', name: 'Trần Bình', phone: '0987654321', email: 'phone@example.invalid', region: 'Hà Nội' };
  leads.push(buyer);
  const byPhone = await service.createOrder(buyer, PAID_FUNNELS.breakout);
  assert.equal((await service.describe(byPhone)).transfer_content, 'TRAN BINH 0987654321');
  assert.ok((await service.describe(byPhone)).qr_url.includes('addInfo=TRAN+BINH+0987654321'));
  assert.equal((await service.recordBankTransfer({ id: 3, transferType: 'in', content: 'MBVCB.1 TRAN BINH 0987654321 FT26', transferAmount: 99000 })).applied, true);
  assert.equal(byPhone.status, 'won');
  // Two waiting orders on one phone (family): never guessed.
  const sibling = { id: 'lead-sib', page_id: 'breakout', name: 'Trần An', phone: '0977000111', email: 'a@example.invalid', region: 'Hà Nội' };
  const sibling2 = { ...sibling, id: 'lead-sib2', name: 'Trần Bảo', email: 'b@example.invalid' };
  leads.push(sibling, sibling2);
  const o1 = await service.createOrder(sibling, PAID_FUNNELS.breakout), o2 = await service.createOrder(sibling2, PAID_FUNNELS.breakout);
  assert.equal((await service.recordBankTransfer({ id: 4, transferType: 'in', content: 'TRAN AN 0977000111', transferAmount: 99000 })).reason, 'ambiguous');
  assert.equal(o1.status, 'pending'); assert.equal(o2.status, 'pending');
  const funnel = PAID_FUNNELS.breakout;
  assert.equal(regionOpen(funnel, 'Hà Nội', new Date('2026-11-07T23:59:00+07:00')), true);
  assert.equal(regionOpen(funnel, 'Hà Nội', new Date('2026-11-08T00:00:00+07:00')), false);
  assert.equal(regionOpen(funnel, 'TP. Hồ Chí Minh', new Date('2026-11-08T00:00:00+07:00')), true);
  assert.equal(regionOpen(funnel, 'Đà Nẵng', new Date('2026-10-01T00:00:00+07:00')), false);
  leads.length = 0; orders.length = 0; notes.length = 0;
  console.log('PASS: orders, public view, SePay matching, registration windows');
}

async function main() {
  await serviceChecks();
  process.env.SEPAY_WEBHOOK_KEY = 'test-sepay-key';
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
  let browser, realDates;
  try {
    const post = (url, body, headers = {}) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    // API guards
    let response = await post('/api/register', { name: 'A', phone: '0901234567', email: 'a@example.invalid', page_id: 'breakout', region: 'Đà Nẵng' });
    assert.equal(response.status, 400);
    assert.equal((await fetch(`${base}/api/checkout/BTNOPE22`)).status, 404);
    const regions = PAID_FUNNELS.breakout.regions;
    realDates = Object.fromEntries(Object.entries(regions).map(([name, info]) => [name, info.starts_on]));
    regions['Hà Nội'].starts_on = '2020-01-01';
    response = await post('/api/register', { name: 'A', phone: '0901234567', email: 'closed@example.invalid', page_id: 'breakout', region: 'Hà Nội' });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'region_closed');
    for (const info of Object.values(regions)) info.starts_on = '2099-01-01';
    assert.equal((await post('/api/checkout/sepay-webhook', {}, { Authorization: 'Apikey wrong-key-000' })).status, 401);
    assert.equal(leads.length, 0);
    for (const route of ['/breakout', '/breakout/thanh-toan', '/breakout/thank-you-hn', '/breakout/thank-you-hcm']) {
      const page = await fetch(base + route);
      assert.equal(page.status, 200, route);
      assert.ok((await page.text()).includes('data-funnel="breakout"'), `${route} carries the funnel tracker`);
    }

    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const beforeEvents = new Date('2026-10-21T10:00:00+07:00');
    await context.clock.setFixedTime(beforeEvents);
    const qrSample = process.env.BREAKOUT_QR_SAMPLE && fs.existsSync(process.env.BREAKOUT_QR_SAMPLE) ? fs.readFileSync(process.env.BREAKOUT_QR_SAMPLE) : null;
    const qrRequests = [];
    await context.route('**/*', route => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      if (url.startsWith('https://img.vietqr.io/')) {
        qrRequests.push(url);
        return qrSample ? route.fulfill({ contentType: 'image/png', body: qrSample })
          : route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#111"/></svg>' });
      }
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/breakout?utm_source=test`);
    const fits = () => page.evaluate(() => document.querySelector('main').getBoundingClientRect().height <= innerHeight + 1);
    assert.ok(await fits(), 'landing fits one screen');
    if (shots) await shot(page, path.join(shots, 'landing-desktop.png'));

    // Validation: region is required.
    await page.fill('#name', 'Nguyễn Văn Test');
    await page.fill('#phone', '0901 234 567');
    await page.fill('#email', 'Test@Example.invalid');
    await page.click('#registration-form button[type="submit"]');
    await page.waitForSelector('#form-error:not([hidden])');
    assert.match(await page.textContent('#form-error'), /khu vực/);
    await page.click('label.region:has-text("TP. Hồ Chí Minh")');
    await page.click('#registration-form button[type="submit"]');
    await page.waitForURL(/\/breakout\/thanh-toan$/);
    const ref = orders[0].payment_ref;
    assert.equal(await page.evaluate(() => localStorage.getItem('breakout:ref')), ref, 'code kept in the browser, not the URL');
    assert.equal(leads.length, 1);
    assert.equal(leads[0].region, 'TP. Hồ Chí Minh');
    assert.equal(leads[0].page_id, 'breakout');
    assert.equal(leads[0].utm_source, 'test');
    assert.equal(orders[0].payment_ref, ref);
    assert.ok(sent.some(([kind, payload]) => kind === 'webhook' && payload.payment_ref === ref && payload.payment_amount === 99000));
    await page.waitForSelector('#pay-card:not([hidden])');
    assert.equal(await page.textContent('#transfer-content'), 'N VAN TEST 0901234567');
    assert.equal(await page.textContent('#bank-account'), '0451000368876');
    assert.match(await page.textContent('#amount'), /99\.000đ/);
    assert.match(await page.textContent('#pay-lead'), /TP\. Hồ Chí Minh · 15\/11\/2026/);
    assert.ok(await fits(), 'payment page fits one screen');
    assert.ok(await page.isHidden('#pay-missing'));
    assert.ok(qrRequests.some(url => url.includes('addInfo=N+VAN+TEST+0901234567') && url.includes('amount=99000')));
    if (shots) { await page.waitForTimeout(300); await shot(page, path.join(shots, 'payment-desktop.png')); }

    // Same email again: same order back, no second lead, no CAPI conversion, no webhook.
    const capiBefore = sent.filter(([kind]) => kind === 'capi').length;
    const hooksBefore = sent.filter(([kind]) => kind === 'webhook').length;
    response = await post('/api/register', { name: 'Nguyễn Văn Test', phone: '0901234567', email: 'test@example.invalid', page_id: 'breakout', region: 'TP. Hồ Chí Minh' });
    const again = await response.json();
    assert.equal(again.payment.ref, ref);
    assert.equal(again.duplicate, true);
    assert.equal(leads.length, 1);
    assert.equal(sent.filter(([kind]) => kind === 'capi').length, capiBefore);
    assert.equal(sent.filter(([kind]) => kind === 'webhook').length, hooksBefore, 'A repeat is not sent to n8n/HubCRM');
    // Same email through the form again: same code, "đã đăng ký trước đó" note, clean URL.
    await page.goto(`${base}/breakout`);
    await page.fill('#name', 'Nguyễn Văn Test');
    await page.fill('#phone', '0901234567');
    await page.fill('#email', 'test@example.invalid');
    await page.click('label.region:has-text("TP. Hồ Chí Minh")');
    await page.click('#registration-form button[type="submit"]');
    await page.waitForURL(/\/breakout\/thanh-toan$/);
    await page.waitForSelector('#repeat-note:not([hidden])');
    assert.equal(await page.textContent('#transfer-content'), 'N VAN TEST 0901234567');
    await page.reload();
    await page.waitForSelector('#pay-card:not([hidden])');
    assert.ok(await page.isHidden('#repeat-note'), 'repeat note shows once');
    // Changing region before paying: lead follows, the sale gets a note.
    response = await post('/api/register', { name: 'Nguyễn Văn Test', phone: '0901234567', email: 'test@example.invalid', page_id: 'breakout', region: 'Hà Nội' });
    assert.equal((await response.json()).payment.thank_you_url, '/breakout/thank-you-hn');
    assert.equal(leads[0].region, 'Hà Nội');
    assert.ok(notes.some(note => note.body.includes('đổi khu vực TP. Hồ Chí Minh → Hà Nội')));
    await post('/api/register', { name: 'Nguyễn Văn Test', phone: '0901234567', email: 'test@example.invalid', page_id: 'breakout', region: 'TP. Hồ Chí Minh' });
    assert.equal(leads[0].region, 'TP. Hồ Chí Minh');
    assert.equal(orders.length, 1);

    // "Đã chuyển khoản" → HCM Zalo page with the transfer code, order still pending, note for the sale.
    await page.click('#confirm');
    await page.waitForURL(/\/breakout\/thank-you-hcm$/);
    assert.ok(orders[0].customer_confirmed_at);
    assert.equal(orders[0].status, 'pending');
    assert.ok(notes.some(note => note.body.includes(ref)));
    assert.match(await page.textContent(".thank-info .wide"), /Tầng 1, Khách sạn White Lion/);
    assert.equal(await page.getAttribute('.zalo-button', 'href'), 'https://zalo.me/g/vllxssd3tqowcoxg3a3e');
    assert.equal(await page.getAttribute('#back-to-qr', 'href'), '/breakout/thanh-toan');
    assert.ok(await fits(), 'thank-you page fits one screen');
    assert.match(await page.textContent('.confirm-box'), /duyệt bạn vào nhóm/);
    if (shots) await shot(page, path.join(shots, 'thank-you-desktop.png'));

    // Wrong region page redirects to the right group.
    // Old links with ?ma= still work and the code is removed from the address bar.
    await page.goto(`${base}/breakout/thank-you-hn?ma=${ref}`);
    await page.waitForURL(/\/breakout\/thank-you-hcm$/);

    // SePay (optional) reports the transfer → order won.
    response = await post('/api/checkout/sepay-webhook', { id: 99, transferType: 'in', transferAmount: 99000, content: `${ref} chuyen tien` }, { Authorization: 'Apikey test-sepay-key' });
    assert.equal((await response.json()).applied, true);
    assert.equal(orders[0].status, 'won');
    // A paid order sends the payment page straight to the thank-you page.
    await page.goto(`${base}/breakout/thanh-toan?ma=${ref}`);
    await page.waitForURL(/\/breakout\/thank-you-hcm/);

    // Paid, then registers again for the other region: region kept, customer told to call.
    await page.goto(`${base}/breakout`);
    await page.fill('#name', 'Nguyễn Văn Test');
    await page.fill('#phone', '0901234567');
    await page.fill('#email', 'test@example.invalid');
    await page.click('label.region:has-text("Hà Nội")');
    await page.click('#registration-form button[type="submit"]');
    await page.waitForSelector('#form-info:not([hidden])');
    assert.match(await page.textContent('#form-info'), /đã đăng ký và thanh toán cho khu vực TP\. Hồ Chí Minh/);
    assert.equal(new URL(page.url()).pathname, '/breakout');
    assert.equal(leads[0].region, 'TP. Hồ Chí Minh');
    assert.ok(notes.some(note => note.body.includes('đã thanh toán cho TP. Hồ Chí Minh')));

    // Same phone, another email: new lead, flagged for the sale.
    response = await post('/api/register', { name: 'Người Nhà', phone: '+84 901 234 567', email: 'family@example.invalid', page_id: 'breakout', region: 'Hà Nội' });
    assert.equal((await response.json()).duplicate, undefined);
    const family = leads.find(lead => lead.email === 'family@example.invalid');
    assert.ok(notes.some(note => note.registrationId === family.id && note.body.includes('Trùng SĐT') && note.body.includes('test@example.invalid')));

    // Registration windows in the browser and the page without a code.
    const later = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await later.route('**/*', route => route.request().url().startsWith(base) ? route.continue() : route.abort());
    await later.clock.setFixedTime(new Date('2026-11-10T09:00:00+07:00'));
    const closedPage = await later.newPage();
    await closedPage.goto(`${base}/breakout`);
    assert.equal(await closedPage.isDisabled('input[value="Hà Nội"]'), true);
    assert.equal(await closedPage.isDisabled('input[value="TP. Hồ Chí Minh"]'), false);
    assert.match(await closedPage.textContent('label.region.closed'), /Đã đóng đăng ký/);
    await later.clock.setFixedTime(new Date('2026-11-16T09:00:00+07:00'));
    await closedPage.reload();
    await closedPage.waitForSelector('#form-closed:not([hidden])');
    assert.ok(await closedPage.isHidden('#registration-form button[type="submit"]'));
    await closedPage.goto(`${base}/breakout/thanh-toan`);
    await closedPage.waitForSelector('#pay-missing:not([hidden])');
    assert.match(await closedPage.textContent('#pay-missing'), /Bạn chưa có mã thanh toán/);
    await later.close();

    if (shots) {
      const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
      await phone.route('**/*', route => route.request().url().startsWith(base) ? route.continue()
        : route.request().url().startsWith('https://img.vietqr.io/') && qrSample ? route.fulfill({ contentType: 'image/png', body: qrSample }) : route.abort());
      const mobile = await phone.newPage();
      await mobile.goto(`${base}/breakout`);
      await shot(mobile, path.join(shots, 'landing-mobile.png'));
      // Phones: eyebrow and submit button stay on one line, arrows only on PC.
      const oneLine = selector => mobile.evaluate(sel => { const el = document.querySelector(sel); const lh = parseFloat(getComputedStyle(el).lineHeight) || 24; return el.getClientRects().length && el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().height < lh * 1.9 + 34; }, selector);
      assert.ok(await oneLine('.eyebrow'), 'eyebrow on one line');
      assert.ok(await oneLine('#registration-form button[type="submit"]'), 'submit button on one line');
      assert.ok(await mobile.isHidden('h1 svg'));
      const lead = { id: 'lead-mobile', page_id: 'breakout', email: 'm@example.invalid', region: 'Hà Nội' };
      leads.push(lead);
      const order = await createBankTransferService({ storage }).createOrder(lead, PAID_FUNNELS.breakout);
      await mobile.goto(`${base}/breakout/thanh-toan?ma=${order.payment_ref}`);
      await mobile.waitForSelector('#pay-card:not([hidden])');
      await mobile.waitForTimeout(300);
      await shot(mobile, path.join(shots, 'payment-mobile.png'));
      await mobile.goto(`${base}/breakout/thank-you-hn`);
      await shot(mobile, path.join(shots, 'thank-you-mobile.png'));
      const scroll = await mobile.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(scroll <= 0, 'no horizontal scroll on phones');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: landing → QR payment → regional thank-you, repeat/region/phone cases, closed regions, SePay');
  } finally {
    for (const [name, date] of Object.entries(realDates || {})) PAID_FUNNELS.breakout.regions[name].starts_on = date;
    await browser?.close();
    server.close();
  }
}

main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
