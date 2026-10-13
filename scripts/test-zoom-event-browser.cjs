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

      // Back on the landing, the device remembers the personal page.
      await page.goto(base + '/zoom', { waitUntil: 'load' });
      assert.equal(await page.locator('#returning').isVisible(), true);
      assert.equal(new URL(await page.locator('#returningLink').getAttribute('href'), base).href, joinPage);

      // A CRM lead from another funnel goes straight to the personal page.
      await page.fill('#email', known.email.toUpperCase());
      await page.click('#joinButton');
      await page.waitForURL(/\/zoom\/vao-hoc\/[\w-]+$/);
      await page.locator('#joinLink[aria-disabled="false"]').waitFor();

      // A HubCRM customer unknown to this site also goes straight to the personal page.
      await page.goto(base + '/zoom', { waitUntil: 'load' });
      await page.fill('#email', hubcrmEmail);
      await page.click('#joinButton');
      await page.waitForURL(/\/zoom\/vao-hoc\/[\w-]+$/);
      await page.locator('#greeting', { hasText: 'Chào Khách HubCRM' }).waitFor();

      // Zoom refuses at first: the button stays grey, then lights up once the link exists.
      if (name === 'desktop') {
        zoomRefuses = true;
        await page.goto(base + '/zoom', { waitUntil: 'load' });
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
