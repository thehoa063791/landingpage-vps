// node scripts/test-website-pages.cjs — the pages kept from the WordPress site (pages/website):
// every route answers with its own tracking (GTM, no shared Pixel), / is the website home only
// on phamthanhbien.com, no request goes back to WordPress, and the /cashching (LadiPage) and
// /loinhuan (Thrive popup) forms register through the real /api/register on in-memory storage.
// Nothing leaves the machine: CAPI/webhooks are recorded, external requests blocked.
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..');
const leads = [], sent = [], appended = [];
const storage = {
  supabase: { from: () => { throw new Error('no database in this test'); } },
  getRegistrations: async () => leads,
  getRegistrationById: async id => leads.find(lead => lead.id === id) || null,
  insertRegistration: async row => { leads.push({ ...row }); },
  updateRegistration: async (id, updates) => { Object.assign(leads.find(lead => lead.id === id), updates); },
  tagLeadByPage: async () => {},
  insertEvent: async () => {},
  countRegistrationsByPage: async () => 0,
  insertSurvey: async () => {},
  addLeadNote: async () => {},
  findRegistrationInPage: async (pageId, email) => leads.find(l => l.page_id === pageId && l.email.trim().toLowerCase() === String(email).trim().toLowerCase()) || null,
  appendRegistrationForm: async (id, form, options) => { appended.push({ id, form, options }); },
};
const stub = (file, exports) => { require.cache[require.resolve(path.join(root, file))] = { id: file, filename: file, loaded: true, exports }; };
stub('src/storage.js', storage);
stub('src/metaCapi.js', { sendRegistrationEvents: async (req, record) => { sent.push(['capi', record.page_id]); }, sendTrackEvent: async () => {} });
stub('src/webhooks.js', { buildWebhookPayload: record => ({ page_id: record.page_id }), fireWebhooks: async payload => { sent.push(['webhook', payload.page_id]); } });
stub('src/emailValidation.js', { rejection: async () => null });
const utils = require('../src/utils');
stub('src/utils.js', { ...utils, lookupGeo: async () => null });

const PAGES = ['home', 've-toi', 'chinh-sach-quy-dinh', 'cashching', 'cashchingclub', 'playlist-2', 'loinhuan', 'vong-quay-von', 'tai-san-va-dong-tien',
  'phan-bo-danh-muc-dau-tu', 'quan-tri-cam-xuc', 'phuong-phap-hoi-tu-ky-thuat', 'thank-you-webinar'];

(async () => {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(root, 'public')));
  const funnelAssets = express.static(path.join(root, 'pages'), { index: false, redirect: false });
  app.use('/p', (req, res, next) => /\.html$/i.test(req.path) ? next() : funnelAssets(req, res, next));
  app.use('/api', require('../src/routes/api'));
  app.use('/', require('../src/routes/pages'));
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    // ── Routes ──
    for (const slug of PAGES) {
      const res = await fetch(`${base}/${slug}`);
      const html = await res.text();
      assert.equal(res.status, 200, slug);
      assert.ok(html.includes('GTM-') || slug === 'cashching', `${slug} keeps its own tracking`);
      assert.ok(!html.includes('/js/meta-pixel.js'), `${slug}: no shared Pixel next to the site's own tags`);
      assert.ok(html.includes('data-funnel="website"'), `${slug} reports to the Website funnel`);
      assert.ok(!/(?:src|href)=["']https?:\/\/(?:www\.)?phamthanhbien\.com\/wp-/i.test(html), `${slug} loads nothing from WordPress`);
      assert.ok(!/email-protection|__cf_email__/.test(html), `${slug}: emails written out`);
      assert.equal(html.includes('/p/website/forms.js'), ['cashching', 'loinhuan'].includes(slug), `${slug}: form script only where there is a form`);
    }
    assert.equal((await fetch(`${base}/ve-toi/`)).status, 200, 'Trailing slash as on WordPress');
    const other = await fetch(`${base}/?utm_source=x`, { redirect: 'manual' });
    assert.equal(other.headers.get('location'), '/trading?utm_source=x', 'Other hosts keep / → /trading');
    // fetch() cannot set Host: plain http.request for the host checks.
    const byHost = host => new Promise((resolve, reject) => require('node:http').get({ host: '127.0.0.1', port: server.address().port, path: '/', headers: { Host: host } }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', c => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject));
    for (const host of ['phamthanhbien.com', 'www.phamthanhbien.com']) {
      const res = await byHost(host);
      assert.ok(res.status === 200 && res.body.includes('data-funnel="website"'), `/ on ${host} is the website home`);
    }
    assert.equal((await byHost('event.phamthanhbien.com')).status, 302, 'event.phamthanhbien.com/ still goes to /trading');

    // ── Browser: no WordPress requests, the two forms ──
    browser = await chromium.launch();
    const context = await browser.newContext();
    const wordpress = [], ladiSubmits = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === base) return route.continue();
      if (/(^|\.)phamthanhbien\.com$/.test(url.hostname)) wordpress.push(url.href);
      if (/ldpform/.test(url.hostname)) ladiSubmits.push(url.href);
      // LadiPage's runtime renders /cashching; everything else external stays blocked.
      if (/(^|\.)ladicdn\.com$/.test(url.hostname)) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // /cashching: LadiPage form → /api/register as page "cashching".
    await page.goto(`${base}/cashching?utm_source=fb&utm_campaign=k80&fbclid=abc`);
    const ladi = page.locator('form.ladi-form').first();
    await ladi.locator('[name=name]').fill('Nguyễn Văn A');
    await ladi.locator('[name=email]').fill('a@example.invalid');
    await ladi.locator('[name=phone]').fill('0912345678');
    await ladi.locator('[name=phone]').press('Enter');
    await page.getByText('Câu trả lời của bạn đã được ghi nhận!').waitFor();
    const cash = leads.find(l => l.email === 'a@example.invalid');
    assert.deepEqual({ page: cash.page_id, name: cash.name, phone: cash.phone, utm: cash.utm_source, campaign: cash.utm_campaign, fbc: /^fb\.\d\.\d+\.abc$/.test(cash.fbc) }, { page: 'cashching', name: 'Nguyễn Văn A', phone: '0912345678', utm: 'fb', campaign: 'k80', fbc: true });
    assert.deepEqual(ladiSubmits, [], 'LadiPage never receives the form');
    assert.equal(await ladi.locator('[name=email]').inputValue(), '', 'Form cleared after success');
    // The same email again on the same page: no second lead, no CAPI/webhook, history only.
    const sentBefore = sent.length;
    await page.evaluate(() => document.querySelector('.wf-toast')?.remove());
    await ladi.locator('[name=name]').fill('Nguyễn Văn A');
    await ladi.locator('[name=email]').fill(' A@example.invalid ');
    await ladi.locator('[name=phone]').fill('0912345678');
    await ladi.locator('[name=phone]').press('Enter');
    await page.getByText('Câu trả lời của bạn đã được ghi nhận!').waitFor();
    assert.equal(leads.length, 1, 'A repeat creates no lead');
    assert.equal(sent.length, sentBefore, 'A repeat sends no CAPI or webhook');
    assert.deepEqual({ id: appended[0].id, source: appended[0].options.source, keep: appended[0].options.update_latest, page: appended[0].form.page_id }, { id: cash.id, source: 'repeat_submission', keep: false, page: 'cashching' });
    // Invalid phone: message, no lead.
    await ladi.locator('[name=name]').fill('B');
    await ladi.locator('[name=email]').fill('b@example.invalid');
    await ladi.locator('[name=phone]').fill('12');
    await ladi.locator('[name=phone]').press('Enter');
    await page.getByText('Vui lòng nhập số điện thoại hợp lệ.').waitFor();
    assert.equal(leads.length, 1);

    // /loinhuan: the "YES" buttons open the rebuilt Thrive form; success → /thank-you-webinar.
    await page.goto(`${base}/loinhuan?utm_source=zalo`);
    await page.getByText('YES, GỬI VÉ CHO TÔI').first().click();
    const modal = page.locator('.wf-modal');
    await modal.getByRole('dialog').waitFor();
    await modal.getByPlaceholder('Họ và tên').fill('Trần Thị B');
    await modal.getByPlaceholder('Địa chỉ email').fill('b2@example.invalid');
    await modal.getByPlaceholder('Số điện thoại').fill('+84 988 777 666');
    await modal.getByRole('button', { name: 'Xác nhận' }).click();
    await modal.getByText('Vui lòng chọn lĩnh vực quan tâm.').waitFor();
    await modal.getByLabel('Chứng khoán, tài sản số, tiền tệ').check();
    await modal.getByRole('button', { name: 'Xác nhận' }).click();
    await modal.getByText('Vui lòng chọn khu vực của bạn.').waitFor();
    await modal.getByLabel('Nước ngoài').check();
    await Promise.all([page.waitForURL('**/thank-you-webinar'), modal.getByRole('button', { name: 'Xác nhận' }).click()]);
    const loi = leads.find(l => l.email === 'b2@example.invalid');
    assert.deepEqual({ page: loi.page_id, interest: loi.interest, region: loi.region, utm: loi.utm_source }, { page: 'loinhuan', interest: 'Chứng khoán, tài sản số, tiền tệ', region: 'Nước ngoài', utm: 'zalo' });
    assert.deepEqual(sent.filter(s => s[0] === 'capi').map(s => s[1]), ['cashching', 'loinhuan'], 'Each registration goes through the usual CAPI/webhook path once');
    // Escape closes the popup.
    await page.goto(`${base}/loinhuan`);
    await page.getByText('YES, TÔI MUỐN THAM DỰ!').first().click();
    await modal.getByRole('dialog').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await modal.isHidden(), true);
    assert.deepEqual([...new Set(wordpress.map(u => new URL(u).pathname.split('/').slice(0, 3).join('/')))], [], 'No request goes back to WordPress');
    console.log(`PASS: ${PAGES.length} website pages served with their own GTM (no shared Pixel), / is the home on phamthanhbien.com only, nothing loads from WordPress, /cashching and /loinhuan forms register through /api/register with attribution (LadiPage/Thrive never receive them).${errors.length ? ` (page errors from the copied site scripts: ${[...new Set(errors)].length})` : ''}`);
  } finally {
    await browser?.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
