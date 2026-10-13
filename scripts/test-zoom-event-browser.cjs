// node scripts/test-zoom-event-browser.cjs [screenshot-dir] — /zoom in a real browser
// against an in-process server (local data) with a fake Zoom API: new email → info →
// personal page → Zoom; known CRM email → personal page directly. Restores the settings.
process.env.PORT = process.env.ZOOM_TEST_PORT || '3011';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zoomService = require('../src/zoomService');
let zoomRefuses = false;
zoomService.zoomRequest = async (method, route, body) => {
  if (zoomRefuses) throw Object.assign(new Error('Registration has not been enabled for this meeting'), { status: 400, zoomCode: 3000 });
  if (method === 'POST') return { registrant_id: crypto.randomUUID(), join_url: `https://zoom.us/w/${route.split('/')[2]}?tk=${encodeURIComponent(body.email)}` };
  if (method === 'GET') return { topic: 'Buổi thử nghiệm', start_time: '2026-10-25T13:00:00Z', duration: 90, type: 2, settings: { approval_type: 2 } };
  return {};
};
// Never reach the real n8n or HubCRM from tests.
const sentWebhooks = [];
require('../src/webhooks').fireWebhooks = async payload => { sentWebhooks.push(payload); };
const hubcrmEmail = `hubcrm-browser-${Date.now()}@example.invalid`;
require('../src/hubcrm').findCustomerByEmail = async email => email === hubcrmEmail ? { id: '777', name: 'Khách HubCRM', email, phone: '0977777777' } : null;
const { chromium } = require('playwright');
const storage = require('../src/storage');
const { getZoomEventService } = require('../src/zoomEvent');

const shots = process.argv[2] || '';
const base = `http://127.0.0.1:${process.env.PORT}`;

// The landing as a new visitor sees it (a saved personal page shows the welcome card).
async function openForm(page) {
  await page.goto(base + '/zoom', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.removeItem('zoom-event:access'));
  await page.reload({ waitUntil: 'load' });
  await page.locator('#joinForm').waitFor();
}

async function main() {
  require('../server');
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/zoom'); break; } catch { await new Promise(r => setTimeout(r, 200)); } }
  const service = getZoomEventService();
  const original = await storage.getCrmSetting('zoom_event_settings', null);
  const browser = await chromium.launch();
  try {
    await service.saveSettings({ zoom_kind: 'meeting', zoom_id: '81234567890', starts_at: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString(), duration_minutes: 120 });
    const known = (await storage.getRegistrations()).find(r => /@/.test(r.email || '') && r.page_id !== 'zoom-event');
    assert.ok(known, 'local CRM needs at least one lead');

    for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => { if (page.url().startsWith(base)) errors.push(error.message + ' @ ' + page.url()); });
      await context.route('https://zoom.us/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Zoom stub</title>ZOOM OK' }));
      await page.goto(base + '/zoom', { waitUntil: 'load' });
      assert.match(await page.locator('[data-d]').textContent(), /^0[12]$/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}: no horizontal scroll`);
      if (shots) await page.screenshot({ path: `${shots}/zoom-${name}-landing.png`, fullPage: true });

      // Invalid email stays on the page with a message.
      await page.fill('#email', 'abc');
      await page.click('#joinButton');
      await page.locator('#formError', { hasText: 'email hợp lệ' }).waitFor();

      // New email → info page → personal page → Zoom.
      const email = `zoom-browser-${name}-${Date.now()}@example.invalid`;
      await page.fill('#email', email);
      await page.click('#joinButton');
      await page.waitForURL(/\/zoom\/hoan-tat$/);
      assert.equal(await page.locator('#emailText').textContent(), email);
      if (shots) await page.screenshot({ path: `${shots}/zoom-${name}-complete.png`, fullPage: true });
      await page.fill('#name', 'Khách Thử Zoom');
      await page.fill('#phone', '0901234567');
      await page.click('#submitButton');
      await page.locator('#formError', { hasText: 'khu vực' }).waitFor();
      await page.selectOption('#region', 'Hà Nội');
      await page.click('#submitButton');
      await page.waitForURL(/\/zoom\/vao-hoc\/[\w-]+$/);
      await page.locator('#greeting', { hasText: 'Chào Khách Thử Zoom' }).waitFor();
      await page.locator('#joinLink[aria-disabled="false"]').waitFor();
      if (shots) await page.screenshot({ path: `${shots}/zoom-${name}-join.png`, fullPage: true });
      const joinPage = page.url();
      // Calendar reminder carries the personal link; no subtitle or tips list on this page.
      const calendar = new URL(await page.locator('#calendarLink').getAttribute('href'));
      const joinKey = joinPage.split('/').pop();
      assert.equal(calendar.searchParams.get('location'), base + '/zoom/join/' + joinKey);
      assert.ok(calendar.searchParams.get('details').includes(base + '/zoom/join/' + joinKey));
      assert.match(calendar.searchParams.get('text'), /^Vào học: /);
      assert.equal(await page.locator('#joinLead').isVisible(), false);
      assert.equal(await page.locator('.join-tips').count(), 0);
      await page.click('#joinLink');
      await page.waitForURL(/^https:\/\/zoom\.us\/w\/81234567890\?tk=/);
      assert.ok(page.url().includes(encodeURIComponent(email)));
      const lead = (await storage.getRegistrations()).find(r => r.email === email);
      assert.deepEqual([lead?.page_id, lead?.region, lead?.phone], ['zoom-event', 'Hà Nội', '0901234567']);

      // Back on the landing: greeted by name; before the start "Vào học ngay" opens the
      // personal page, while the event runs it opens Zoom directly.
      await page.goto(base + '/zoom', { waitUntil: 'load' });
      await page.locator('#welcomeTitle', { hasText: 'Chào Khách Thử Zoom, bạn đã đăng ký thành công' }).waitFor();
      assert.equal(await page.locator('#joinForm').isVisible(), false);
      assert.equal(new URL(await page.locator('#welcomeJoin').getAttribute('href'), base).href, joinPage);
      if (shots) await page.screenshot({ path: `${shots}/zoom-${name}-welcome.png` });
      const scheduled = (await service.settings()).starts_at;
      await service.saveSettings({ starts_at: new Date(Date.now() - 10 * 60000).toISOString(), duration_minutes: 120 });
      await page.goto(base + '/zoom', { waitUntil: 'load' });
      await page.locator('#welcomeNote', { hasText: 'đang diễn ra' }).waitFor();
      await page.click('#welcomeJoin');
      await page.waitForURL(/^https:\/\/zoom\.us\/w\/81234567890\?tk=/);
      await service.saveSettings({ starts_at: scheduled });
      // "Đăng ký bằng email khác" brings the form back and forgets this device's page.
      await page.goto(base + '/zoom', { waitUntil: 'load' });
      await page.locator('#welcome').waitFor();
      await page.click('#otherEmail');
      await page.locator('#joinForm').waitFor();
      assert.equal(await page.evaluate(() => localStorage.getItem('zoom-event:access')), null);

      // A CRM lead from another funnel goes straight to the personal page.
      await page.fill('#email', known.email.toUpperCase());
      await page.click('#joinButton');
      await page.waitForURL(/\/zoom\/vao-hoc\/[\w-]+$/);
      await page.locator('#joinLink[aria-disabled="false"]').waitFor();

      // A HubCRM customer unknown to this site also goes straight to the personal page.
      await openForm(page);
      await page.fill('#email', hubcrmEmail);
      await page.click('#joinButton');
      await page.waitForURL(/\/zoom\/vao-hoc\/[\w-]+$/);
      await page.locator('#greeting', { hasText: 'Chào Khách HubCRM' }).waitFor();

      // Zoom refuses at first: the button stays grey, then lights up once the link exists.
      if (name === 'desktop') {
        zoomRefuses = true;
        await openForm(page);
        await page.fill('#email', known.email);
        await service.saveSettings({ zoom_id: '9' + String(Date.now()).slice(-10) });
        await page.click('#joinButton');
        await page.waitForURL(/\/zoom\/vao-hoc\/[\w-]+$/);
        await page.locator('#joinLink.is-waiting[aria-disabled="true"]').waitFor();
        await page.locator('#notice', { hasText: 'Đang tạo link Zoom' }).waitFor();
        if (shots) await page.screenshot({ path: `${shots}/zoom-desktop-waiting.png` });
        await page.click('#joinLink', { force: true });
        assert.match(page.url(), /\/zoom\/vao-hoc\//, 'a grey button does not navigate');
        zoomRefuses = false;
        await service.retryLinks();
        await page.locator('#joinLink.just-ready[aria-disabled="false"]').waitFor({ timeout: 15000 });
        await page.locator('#notice', { hasText: 'đã sẵn sàng' }).waitFor();
        if (shots) await page.screenshot({ path: `${shots}/zoom-desktop-ready.png` });
        await service.saveSettings({ zoom_id: '81234567890' });
      }

      // A ?email= link: a CRM customer is greeted straight away; the email leaves the URL
      // before any tracking request and is never sent to analytics or Meta.
      const tracked = [];
      page.on('request', request => { if (/\/api\/track|facebook\.com\/tr|connect\.facebook/.test(request.url())) tracked.push(request.url() + ' ' + (request.postData() || '')); });
      await openForm(page);
      tracked.length = 0;
      await page.goto(`${base}/zoom?email=${encodeURIComponent(known.email)}&utm_source=zalo`, { waitUntil: 'load' });
      await page.locator('#welcome').waitFor();
      assert.match(await page.locator('#welcomeTitle').textContent(), /^Chào .+, bạn đã đăng ký thành công$/);
      assert.equal(new URL(page.url()).search, '?utm_source=zalo');
      assert.ok(await page.evaluate(() => !!localStorage.getItem('zoom-event:access')));
      await page.waitForTimeout(800);
      assert.ok(tracked.length > 0, 'the pageview is still tracked');
      assert.ok(!tracked.some(entry => entry.toLowerCase().includes(known.email.toLowerCase()) || entry.includes(encodeURIComponent(known.email))), 'email not sent to tracking');
      // A ?email= link with a new email: the form is prefilled, nothing is registered yet.
      const fresh = `link-new-${name}-${Date.now()}@example.invalid`;
      await openForm(page);
      await page.goto(`${base}/zoom?email=${encodeURIComponent(fresh)}`, { waitUntil: 'load' });
      await page.locator('#joinForm').waitFor();
      assert.equal(await page.inputValue('#email'), fresh);
      assert.equal(new URL(page.url()).search, '');
      assert.equal((await service.report()).rows.some(row => row.email === fresh), false);

      // An unknown personal link explains how to get a new one.
      await page.goto(base + '/zoom/vao-hoc/' + 'x'.repeat(24), { waitUntil: 'load' });
      await page.locator('#greeting', { hasText: 'Không tìm thấy đăng ký' }).waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    }
    // Admin: sign-ups tab, then the settings tab changes the landing.
    const cookie = require('../src/utils').makeAdminAccessCookie({ id: 'zoom-test', email: 'zoom-test@example.invalid' }).split(';')[0].split('=');
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await adminContext.addCookies([{ name: cookie[0], value: cookie.slice(1).join('='), url: base }]);
    const admin = await adminContext.newPage();
    const adminErrors = [];
    admin.on('pageerror', error => adminErrors.push(error.message));
    await admin.goto(base + '/admin/view/funnels?funnel=zoom-event', { waitUntil: 'load' });
    await admin.getByRole('tab', { name: 'Đăng ký Zoom' }).waitFor();
    await admin.locator('.react-table').getByText('Khách Thử Zoom').first().waitFor();
    if (shots) await admin.screenshot({ path: `${shots}/zoom-admin-registrations.png`, fullPage: true });
    await admin.getByRole('tab', { name: 'Cài đặt sự kiện' }).click();
    await admin.getByRole('button', { name: 'Kiểm tra Zoom' }).click();
    await admin.getByText('Buổi thử nghiệm').waitFor();
    await admin.getByText('Chưa bật đăng ký').waitFor();
    await admin.getByLabel('Tiêu đề dòng 1 (màu trắng)').fill('BUỔI CHIA SẺ');
    await admin.getByLabel('Hotline').fill('');
    if (shots) await admin.screenshot({ path: `${shots}/zoom-admin-settings.png`, fullPage: true });
    await admin.locator('.ze-savebar').getByRole('button', { name: 'Lưu thay đổi' }).click();
    await admin.getByRole('button', { name: 'Đã lưu' }).waitFor();
    const landing = await (await fetch(base + '/zoom')).text();
    assert.ok(landing.includes('<span class="title-1">BUỔI CHIA SẺ</span>') && !landing.includes('tel:'));
    assert.deepEqual(adminErrors, []);
    await adminContext.close();

    const report = await service.report();
    assert.ok(report.summary.registrations >= 3 && report.summary.clicked >= 2);
    assert.ok(sentWebhooks.some(w => w.page_id === 'zoom-event' && w.is_new_lead === true && w.zoom?.join_page_url));
    assert.ok(!sentWebhooks.some(w => w.email === hubcrmEmail), 'HubCRM customers are not sent to n8n');
    console.log('zoom browser test passed');
  } finally {
    await browser.close();
    await storage.setCrmSetting('zoom_event_settings', original ?? {});
  }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
