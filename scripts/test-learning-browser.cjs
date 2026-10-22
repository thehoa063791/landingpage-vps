const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { createRepository } = require('../src/learningRepository');
const { createLearningService } = require('../src/learningService');
const { createRouter } = require('../src/routes/learning');
const { getCourse } = require('../src/learningCourses');
const { pool } = require('../src/db');
// node scripts/test-learning-browser.cjs [catalog.json] [--course trading] [--play-video] ...
const course = process.argv.includes('--course') ? process.argv[process.argv.indexOf('--course') + 1] : 'dong-tien';
getCourse(course);
const site = process.env.DONG_TIEN_TEST_BASE_URL || 'http://localhost:3000';
const productionSafe = process.argv.includes('--production-safe');
if (!['localhost', '127.0.0.1'].includes(new URL(site).hostname) && !productionSafe) {
  throw new Error('Non-local targets require --production-safe to block all production writes.');
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dong-tien-browser-'));
  const error = Object.assign(new Error('isolated offline database'), { code: 'ECONNREFUSED' });
  const store = createRepository({ course, database: { query: async () => { throw error; }, connect: async () => { throw error; } }, directory, fallback: true });
  const leads = [], events = [], settings = new Map(), appendedForms = [];
  const crm = { getRegistrations: async () => leads, getRegistrationById: async id => leads.find(l => l.id === id), insertRegistration: async row => leads.push(row), tagLeadByPage: async () => {}, insertEvent: async row => events.push(row), insertSurvey: async () => {}, getCrmSetting: async (key, fallback) => settings.get(key) ?? fallback, setCrmSetting: async (key, value) => { settings.set(key, value); }, appendRegistrationForm: async (id, form, options) => { appendedForms.push({ id, form, options }); } };
  // CAPI/webhooks of course registrations are recorded, never sent.
  const notified = [];
  const integrations = { capi: { sendRegistrationEvents: async (req, record) => { notified.push(['capi', record.id]); }, sendTrackEvent: async (req, event, data) => { notified.push(['track', event, new URL(data.url).pathname]); }, sendLeadEvent: async (req, record, name) => { notified.push(['milestone', name]); } }, webhooks: { buildWebhookPayload: record => record, fireWebhooks: async record => { notified.push(['webhook', record.id]); } } };
  const service = createLearningService({ course: getCourse(course), store, crm, integrations, secret: 'browser-test-only-secret-do-not-use-in-production' });
  let browser, server;
  try {
    const catalog = process.argv[2] && !process.argv[2].startsWith('--') ? JSON.parse(await fs.readFile(process.argv[2], 'utf8')) : [{ id: 1, title: 'Test lesson 1', vimeo_video_id: '123456789', duration: 100, position: 1, is_visible: true }];
    const firstLesson = [...catalog].sort((a, b) => a.position - b.position).find(row => row.is_visible !== false);
    assert.ok(firstLesson, 'Catalog must contain a visible lesson');
    if (process.argv.includes('--chapters')) {
      await store.update('stages', 1, () => ({ id: 1, title: 'Chương 1: Tài chính', position: 1, is_visible: true }));
      await store.update('stages', 2, () => ({ id: 2, title: 'Chương 2: Thực hành', position: 2, is_visible: true }));
      for (const row of catalog) row.stage_id = row.id === firstLesson.id ? 1 : 2;
      const actualCatalog = await createRepository({ course }).list('lessons'); // Read thumbnail metadata only; test writes remain isolated.
      for (const row of catalog) row.thumbnail_url = actualCatalog.find(l => l.id === row.id)?.thumbnail_url;
      assert.ok(catalog.every(l => l.thumbnail_url), 'Every lesson has a cached Vimeo thumbnail');
    }
    if (process.argv.includes('--cta')) settings.set('learning_ctas', { ctas: [{ id: 'cta_browsertest01', name: 'Test', enabled: true, type: 'zalo', title: 'Join the Zalo group', body: 'Lesson notes are shared there.', button_label: 'Join Zalo', url: 'https://zalo.me/g/test', trigger: 'time', trigger_value: 2, display: 'card', repeat: 'once_per_lesson', hide_after_click: true, targets: { [course]: { scope: 'lessons', ids: [firstLesson.id] } } }] });
    for (const row of catalog) await store.update('lessons', row.id, () => row);
    const learningURL = `**/${course}/learn/${firstLesson.id}`;
    const learningPath = `/${course}/learn/${firstLesson.id}`;
    const sharedTracking = process.argv.includes('--shared-tracking');
    const app = express(); app.use(express.json());
    app.get(`/api/learning/${course}/project/config`, (req, res) => res.json({ enabled: sharedTracking, pixel_id: sharedTracking ? 'TEST_PIXEL' : '', gtm_id: sharedTracking ? 'GTM-TEST123' : '' }));
    app.use(`/api/learning/${course}`, createRouter(service));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    browser = await chromium.launch();
    const page = await browser.newPage({ serviceWorkers: 'block' });
    const blockedWrites = [];
    if (productionSafe) await page.route('**/*', route => {
      // The more specific API route below fulfills mutations using local fixtures.
      // All unhandled mutations are blocked before reaching any real server.
      if (!['GET', 'HEAD'].includes(route.request().method())) {
        blockedWrites.push({ url: route.request().url(), method: route.request().method() });
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    const legacy = [], errors = [], externalAppRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (/test\.ebila\.ai|survey-api|save-tracking-data|fonts\.googleapis|fonts\.gstatic|youtube\.|tradingview\./.test(url.hostname + url.pathname) || (!sharedTracking && /facebook\.|connect\.facebook|google-analytics|googletagmanager/.test(url.hostname))) legacy.push(request.url());
      try {
        if (request.frame() === page.mainFrame() && !['localhost', '127.0.0.1', new URL(site).hostname].includes(url.hostname)) externalAppRequests.push(request.url());
      } catch { /* Browser-owned requests have no application frame. */ }
    });
    await page.addInitScript(() => {
      window.externalTrackingCalls = [];
      window.fbq = (...args) => window.externalTrackingCalls.push(['fbq', ...args]);
      window.gtag = (...args) => window.externalTrackingCalls.push(['gtag', ...args]);
      document.cookie = '_ga=GA1.1.browserTest; path=/; SameSite=Lax';
    });
    if (sharedTracking) await page.route('https://www.googletagmanager.com/**', route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const apiPrefix = `/${course}/api/`;
    // Learning APIs of the page are answered by the isolated local fixture.
    const fixtureRoute = async route => {
      const url = new URL(route.request().url());
      let endpoint;
      if (url.pathname === `${apiPrefix}register`) endpoint = 'register';
      else if (url.pathname === `${apiPrefix}track`) endpoint = 'track';
      else if (url.pathname.startsWith(`${apiPrefix}learning/`)) endpoint = url.pathname.slice(`${apiPrefix}learning/`.length);
      else if (url.pathname.startsWith(`${apiPrefix}project/`)) endpoint = url.pathname.slice(apiPrefix.length);
      if (!endpoint) return route.fallback();
      const fixtureURL = `http://127.0.0.1:${server.address().port}/api/learning/${course}/${endpoint}`;
      assert.equal(new URL(fixtureURL).hostname, '127.0.0.1');
      const response = await route.fetch({ url: fixtureURL, maxRedirects: 0, headers: { ...route.request().headers(), ...(process.env.LEAD_API_KEY ? { 'x-api-key': process.env.LEAD_API_KEY } : {}) } });
      await route.fulfill({ response });
    };
    await page.route(`**${apiPrefix}**`, fixtureRoute);
    await page.goto(`${site}/${course}?utm_source=browser-test&utm_campaign=shared-test&fbclid=fb-test&gclid=g-test&ttclid=tt-test&msclkid=ms-test&twclid=tw-test`);
    const policy = await page.evaluate(() => fetch(location.href).then(response => response.headers.get('content-security-policy')));
    assert.ok(policy?.includes("connect-src 'self'"), 'Page only connects to internal APIs');
    assert.ok(policy?.includes('frame-src https://player.vimeo.com'), 'Only Vimeo embeds are allowed');
    await page.getByPlaceholder('Họ và tên').fill('Browser test student');
    await page.getByPlaceholder('Email', { exact: true }).fill('browser@example.invalid');
    await page.getByPlaceholder('Số điện thoại').fill('0901234567');
    await page.locator('select').selectOption({ index: 1 });
    await page.locator('#v2-submit-btn').click();
    await page.waitForURL(learningURL);
    await page.getByText(firstLesson.title, { exact: true }).first().waitFor();
    await expect.poll(() => events.filter(e => e.event === 'pageview' && e.data.url.includes(learningPath)).length).toBe(1);
    assert.equal(leads[0].utm_source, 'browser-test');
    assert.equal(leads[0].utm_campaign, 'shared-test');
    for (const [key, value] of Object.entries({ fbclid: 'fb-test', gclid: 'g-test', ttclid: 'tt-test', msclkid: 'ms-test', twclid: 'tw-test' })) assert.equal(leads[0][key], value);
    assert.ok(leads[0].fbc.endsWith('.fb-test')); assert.ok(leads[0].fbp.startsWith('fb.1.'));
    assert.equal(leads[0].ga, 'GA1.1.browserTest', 'GA cookie is read into attribution without fabricating a value');
    assert.equal(await page.evaluate(id => sessionStorage.getItem('_sid_' + id), course), leads[0].session_id);
    assert.equal(events.filter(e => e.event === 'conversion').length, 1);
    assert.equal(events.find(e => e.event === 'conversion').event_id, leads[0].id);
    assert.ok(events.some(e => e.event === 'form_open'));
    if (sharedTracking) {
      await expect.poll(() => page.evaluate(() => window.externalTrackingCalls.filter(e => e[1] === 'track' && e[2] === 'CompleteRegistration').length)).toBe(1);
      const conversion = await page.evaluate(() => window.externalTrackingCalls.find(e => e[2] === 'CompleteRegistration'));
      assert.equal(conversion[4].eventID, leads[0].id);
      assert.ok(await page.evaluate(() => window.dataLayer.some(e => e.event === 'virtual_page_view' && /\/learn\//.test(e.page_location))));
      assert.equal(await page.locator('script[src*="gtm.js?id=GTM-TEST123"]').count(), 1);
      assert.ok(await page.evaluate(() => window.dataLayer.some(e => e.event === 'generate_lead' && e.utm_source === 'browser-test')));
    }
    await page.getByRole('button', { name: 'Để sau', exact: true }).click();
    if (process.argv.includes('--chapters')) {
      await expect(page.getByRole('button', { name: /Chương 1: Tài chính/ })).toBeVisible();
      await expect(page.getByRole('button', { name: /Chương 2: Thực hành/ })).toBeVisible();
      for (const chapter of ['Chương 1: Tài chính', 'Chương 2: Thực hành']) {
        const trigger = page.getByRole('button', { name: new RegExp(chapter) });
        if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
      }
      const image = page.locator('img[src*="/api/learning/thumbnails/"]').first();
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
      await fs.mkdir('test-results', { recursive: true });
      await page.screenshot({ path: 'test-results/dong-tien-learning-chapters.png' });
      console.log('PASS: chapter grouping and real Vimeo thumbnails load through the internal same-origin proxy.');
    }
    if (process.argv.includes('--play-video')) {
      await page.addScriptTag({ path: path.join(__dirname, '../pages/dong-tien/node_modules/@vimeo/player/dist/player.js') });
      const duration = await page.evaluate(async () => {
        const frame = document.querySelector('iframe[src*="player.vimeo.com/video/"]');
        if (!frame) throw new Error('Vimeo frame did not initialize');
        window.testVimeoPlayer = new window.Vimeo.Player(frame);
        return Promise.race([(async () => {
          await window.testVimeoPlayer.ready();
          const seconds = await window.testVimeoPlayer.getDuration();
          await window.testVimeoPlayer.setVolume(0);
          await window.testVimeoPlayer.play();
          return seconds;
        })(), new Promise((_, reject) => setTimeout(() => reject(new Error('Vimeo did not start playing within 20 seconds')), 20000))]);
      });
      assert.ok(Math.abs(duration - firstLesson.duration) < 2, 'Imported duration matches the real video');
      await expect.poll(() => page.evaluate(() => window.testVimeoPlayer.getCurrentTime()), { timeout: 20000 }).toBeGreaterThan(3);
      await page.evaluate(() => window.testVimeoPlayer.pause());
      await expect.poll(async () => (await service.getProgress(leads[0], firstLesson.id)).watch_percent, { timeout: 15000 }).toBeGreaterThan(0);
      console.log('PASS: real Vimeo video plays and actual watched coverage reaches the new learning store.');
      if (process.argv.includes('--cta')) {
        const card = page.getByRole('status').filter({ hasText: 'Join the Zalo group' });
        await expect(card).toBeVisible();
        await expect.poll(() => events.some(e => e.event === 'learning_cta_view' && e.data.cta_id === 'cta_browsertest01')).toBe(true);
        await page.context().route('https://zalo.me/**', route => route.fulfill({ contentType: 'text/html', body: 'zalo' }));
        const [popup] = await Promise.all([page.waitForEvent('popup'), card.getByRole('button', { name: 'Join Zalo', exact: true }).click()]);
        assert.equal(popup.url(), 'https://zalo.me/g/test'); await popup.close();
        await expect.poll(() => events.some(e => e.event === 'learning_cta_click')).toBe(true);
        await expect(card).toHaveCount(0);
        console.log('PASS: a lesson CTA appears at its playback time, opens its link in a new tab and records view and click.');
      }
      const durations = await page.evaluate(async rows => {
        return Promise.all(rows.filter(row => row.is_visible !== false).map(async row => {
          const container = document.createElement('div');
          container.style.display = 'none';
          document.body.appendChild(container);
          const [id, hash] = row.vimeo_video_id.split('/');
          const frame = document.createElement('iframe');
          frame.src = `https://player.vimeo.com/video/${id}?dnt=1${hash ? `&h=${hash}` : ''}`;
          frame.referrerPolicy = 'no-referrer';
          container.appendChild(frame);
          const player = new window.Vimeo.Player(frame);
          try {
            await Promise.race([player.ready(), new Promise((_, reject) => setTimeout(() => reject(new Error(`Vimeo ${row.id} did not become ready within 20 seconds`)), 20000))]);
            return { id: row.id, duration: await player.getDuration() };
          } finally { await player.destroy(); container.remove(); }
        }));
      }, catalog);
      for (const row of durations) assert.ok(Math.abs(row.duration - catalog.find(lesson => lesson.id === row.id).duration) < 2, `Vimeo ${row.id} duration matches the imported catalog`);
      console.log(`PASS: all ${durations.length} visible Vimeo embeds initialize with matching durations.`);
    }
    assert.equal(leads.length, 1); assert.equal(leads[0].page_id, course); assert.equal(leads[0].utm_source, 'browser-test');
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.waitForURL(`**/${course}`);
    await page.getByRole('button', { name: 'Đã đăng ký? Đăng nhập' }).click();
    await page.locator('input[type=email]').fill('missing@example.invalid');
    await page.locator('button[type=submit]').click();
    // An unknown email on the login form is named, with a button to register it.
    await page.getByText('chưa có trên hệ thống.').waitFor();
    await expect(page.getByText('missing@example.invalid', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ĐĂNG KÝ MỚI' })).toBeVisible();
    assert.ok(!page.url().includes('/learn'));
    await page.locator('input[type=email]').fill('BROWSER@example.invalid');
    await page.locator('button[type=submit]').click();
    await page.waitForURL(learningURL);
    await page.getByText(firstLesson.title, { exact: true }).first().waitFor();
    await expect.poll(() => events.filter(e => e.event === 'pageview' && e.data.url.includes(learningPath)).length).toBe(2);
    assert.equal(leads.length, 1);
    assert.ok(events.some(e => e.event === 'lesson_view' && e.data.registration_id === leads[0].id));
    if (process.argv.includes('--catalog-changes')) {
      await page.goto(`${site}/${course}/learn/1`);
      await page.waitForURL(learningURL);
      await page.getByText(firstLesson.title, { exact: true }).first().waitFor();
      await store.update('lessons', firstLesson.id, row => ({ ...row, is_visible: false }));
      const next = (await service.catalog())[0];
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForURL(`**/${course}/learn/${next.id}`);
      await page.getByText(next.title, { exact: true }).first().waitFor();
      const added = { ...next, id: 99988777, title: 'Updated chapter lesson', stage_id: 3, position: 100 };
      await store.update('stages', 3, () => ({ id: 3, title: 'Updated chapter', position: 3, is_visible: true }));
      await store.update('lessons', added.id, () => added);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      const chapter = page.locator('button[aria-expanded]').filter({ hasText: 'Updated chapter' });
      await expect(chapter).toBeVisible();
      if (await chapter.getAttribute('aria-expanded') !== 'true') await chapter.click();
      await expect(page.getByText(added.title, { exact: true })).toBeVisible();
      for (const row of await service.catalog()) await store.update('lessons', row.id, p => ({ ...p, is_visible: false }));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByText('Chưa có bài học đang hiển thị. Vui lòng thử lại sau khi danh sách được cập nhật.', { exact: true })).toBeVisible();
      await page.goto(`${site}/${course}/learn/1`);
      await expect(page.getByText('Chưa có bài học đang hiển thị. Vui lòng thử lại sau khi danh sách được cập nhật.', { exact: true })).toBeVisible();
      await store.update('lessons', firstLesson.id, row => ({ ...row, is_visible: true }));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.waitForURL(learningURL);
      await page.getByText(firstLesson.title, { exact: true }).first().waitFor();
      assert.deepEqual(errors, []);
      await expect(page.getByText('Runtime Error', { exact: true })).toHaveCount(0);
      console.log('PASS: stale/deleted lesson URLs recover, chapter/lesson edits refresh on focus, empty catalogs display a message without runtime errors, and newly published lessons recover the page.');
    }
    assert.equal(events.filter(e => e.event === 'conversion').length, 1, 'Login and repeat registration do not add a conversion');
    if (!sharedTracking) assert.deepEqual(await page.evaluate(() => window.externalTrackingCalls), [], 'Disabled project configuration prevents external analytics');
    for (const src of await page.locator('iframe').evaluateAll(frames => frames.map(frame => frame.src))) {
      const url = new URL(src);
      assert.equal(url.hostname, 'player.vimeo.com');
      assert.equal(url.searchParams.get('dnt'), '1');
    }
    // Point 2: an email link logs a registered learner in and the address never
    // carries the email into tracking; an unknown email opens a prefilled registration.
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.waitForURL(`**/${course}`);
    await page.goto(`${site}/${course}?email=Browser%40example.invalid&utm_source=email-link`);
    assert.ok(!page.url().includes('email='), 'The email leaves the address before trackers run');
    await page.waitForURL(learningURL);
    await page.getByText(firstLesson.title, { exact: true }).first().waitFor();
    await expect.poll(() => events.filter(e => e.event === 'learning_login' && e.data.registration_id === leads[0].id).length).toBeGreaterThan(2);
    // Attribution stays in tab storage like other funnels; the learner email cookie lasts 14 days.
    const emailCookie = (await page.context().cookies()).find(c => c.name === `${course}_academic_survey_email`);
    const days = emailCookie.expires * 1000 / 864e5 - Date.now() / 864e5;
    assert.ok(days > 13.9 && days <= 14, 'Learner email cookie lasts 14 days');
    assert.ok(!(await page.context().cookies()).some(c => c.name === 'utm_source'), 'UTM is not persisted in cookies');
    // Returning learners: a live session opens the course; after the 24-hour session the
    // email cookie signs in again; a 401 inside the course keeps the cookie but only prefills.
    const loginCount = () => events.filter(e => e.event === 'learning_login').length;
    await page.goto(`${site}/${course}`);
    await page.waitForURL(learningURL);
    let logins = loginCount();
    await page.evaluate(id => localStorage.setItem(`${id}_academic_survey_login_time`, '1'), course);
    await page.goto(`${site}/${course}`);
    await page.waitForURL(learningURL);
    await page.getByText(firstLesson.title, { exact: true }).first().waitFor();
    assert.equal(loginCount(), logins + 1, 'An expired session signs in again once from the email cookie');
    // Measurement: landing visits that only sign a learner in stay out of landing traffic.
    const landingViews = events.filter(e => e.event === 'pageview' && new URL(e.data.url).pathname === `/${course}`);
    assert.ok(!landingViews[0].data.returning_learner, 'The first landing visit is landing traffic');
    assert.equal(landingViews.at(-1).data.returning_learner, true, 'An automatic sign-in marks its landing view as a returning learner');
    logins = loginCount();
    await page.evaluate(id => localStorage.setItem(`${id}_academic_survey_token`, 'expired-token'), course);
    await page.goto(`${site}/${course}/learn/${firstLesson.id}`);
    await page.waitForURL(`**/${course}`);
    await expect(page.locator('#v2-login-email')).toHaveValue('browser@example.invalid');
    assert.equal(loginCount(), logins, 'A 401 in this tab does not trigger an automatic login loop');
    assert.ok((await page.context().cookies()).some(c => c.name === `${course}_academic_survey_email`), 'A 401 keeps the email cookie');
    await page.locator('#v2-login-btn').click();
    await page.waitForURL(learningURL);
    // ?dang-nhap opens the prefilled login form even with a live session.
    await page.goto(`${site}/${course}?dang-nhap`);
    await expect(page.locator('#v2-login-email')).toHaveValue('browser@example.invalid');
    await page.waitForTimeout(1500);
    assert.ok(!page.url().includes('/learn'), '?dang-nhap stays on the login form');
    await page.goto(`${site}/${course}?action=register`);
    await expect(page.locator('#v2-submit-btn')).toBeVisible();
    // A registered email on the registration form is told to log in; one click signs in.
    await page.getByPlaceholder('Họ và tên').fill('Browser test again');
    await page.getByPlaceholder('Email', { exact: true }).fill('Browser@example.invalid');
    await page.getByPlaceholder('Số điện thoại').fill('0901234567');
    await page.locator('select').selectOption({ index: 1 });
    await page.locator('#v2-submit-btn').click();
    await page.getByText('Email này đã được đăng ký trên hệ thống.', { exact: true }).waitFor();
    assert.equal(leads.length, 1, 'A repeat registration creates no lead');
    await page.getByRole('button', { name: 'ĐĂNG NHẬP NGAY' }).click();
    await page.waitForURL(learningURL);
    // "Trang chủ" in the course shows the landing (prefilled) instead of signing back in.
    await page.getByRole('button', { name: 'Trang chủ' }).click();
    await page.waitForURL(`**/${course}`);
    await expect(page.locator('#v2-login-email')).toHaveValue('browser@example.invalid');
    await page.waitForTimeout(1500);
    assert.ok(!page.url().includes('/learn'), 'The landing stays after "Trang chủ"');
    await page.reload();
    await page.waitForTimeout(1500);
    assert.ok(!page.url().includes('/learn'), 'and keeps staying for the rest of the tab');
    await page.goto(`${site}/${course}/learn/${firstLesson.id}`);
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.waitForURL(`**/${course}`);
    await page.goto(`${site}/${course}?email=new-person%40example.invalid`);
    await expect(page.getByText('Email này chưa đăng ký. Vui lòng điền thông tin bên dưới để nhận video.')).toBeVisible();
    await expect(page.locator('#v2-email')).toHaveValue('new-person@example.invalid');
    assert.equal(leads.length, 1);
    const leaked = [...events.map(e => JSON.stringify(e.data)), ...(await page.evaluate(() => [...(window.dataLayer || []), ...window.externalTrackingCalls].map(e => JSON.stringify(e))))].filter(text => /new-person|email=/i.test(text));
    assert.deepEqual(leaked, [], 'Emails from links never reach events, dataLayer or Pixel calls');
    console.log('PASS: email links log in without leaking the email; unknown emails open prefilled registration; learner email cookie lasts 14 days.');
    // Contact links from the AI customer-care bot: ?email=&name=&phone=&khuvuc= registers
    // a new learner (a normal lead and conversion) and opens the course.
    const leadCount = leads.length;
    // A click in Messenger opens a new tab: no attribution from earlier visits.
    await page.evaluate(() => sessionStorage.clear());
    const linkResponse = await page.goto(`${site}/${course}?email=Bot-Lead%40example.invalid&name=Nguy%E1%BB%85n%20V%C4%83n%20A&phone=%2B84%20399%20545%20712&khuvuc=TP.HCM&utm_campaign=bot`);
    assert.ok(!/email=|name=|phone=|khuvuc=/.test(page.url()), 'Contact details leave the address before trackers run');
    // The server redirects to the clean address (in-app browsers such as Messenger ignore
    // history.replaceState); UTM stays, the hand-over cookie is gone once read.
    if (!productionSafe) {
      const first = linkResponse.request().redirectedFrom();
      assert.ok(first && /email=/.test(first.url()), 'The contact link is answered with a redirect');
      assert.equal(new URL(first.url()).pathname, `/${course}`);
      assert.match(linkResponse.request().url(), /\?utm_campaign=bot$/, 'Only the contact fields are removed');
      assert.ok(!(await page.evaluate(() => document.cookie)).includes('ptb_url_contact'), 'Hand-over cookie deleted');
    }
    await page.waitForURL(learningURL);
    await page.getByText(firstLesson.title, { exact: true }).first().waitFor();
    const botLead = leads.find(l => l.email === 'bot-lead@example.invalid');
    assert.deepEqual({ name: botLead.name, phone: botLead.phone, region: botLead.region, source: botLead.utm_source }, { name: 'Nguyễn Văn A', phone: '0399545712', region: 'Hồ Chí Minh', source: 'ai-cskh' });
    assert.equal(leads.length, leadCount + 1);
    assert.equal(events.filter(e => e.event === 'conversion' && e.event_id === botLead.id).length, 1, 'A link registration is a conversion like the form');
    // The link again with other details: signs in; the lead keeps its data.
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.waitForURL(`**/${course}`);
    await page.goto(`${site}/${course}?email=bot-lead%40example.invalid&name=T%C3%AAn%20kh%C3%A1c&sdt=0911111111&khuvuc=ha%20noi&utm_campaign=cskh-test`);
    await page.waitForURL(learningURL);
    assert.equal(leads.length, leadCount + 1, 'A registered email does not create a second lead');
    assert.equal(botLead.name, 'Nguyễn Văn A');
    assert.deepEqual({ id: appendedForms.at(-1).id, name: appendedForms.at(-1).form.name, phone: appendedForms.at(-1).form.phone, region: appendedForms.at(-1).form.region, source: appendedForms.at(-1).options.source }, { id: botLead.id, name: 'Tên khác', phone: '0911111111', region: 'Hà Nội', source: 'contact_link' });
    // No region on the link: name, email and phone are enough to register and open the course.
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.waitForURL(`**/${course}`);
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(`${site}/${course}?email=no-region%40example.invalid&name=L%C3%AA%20C&phone=0988777666`);
    await page.waitForURL(learningURL);
    const noRegionLead = leads.find(l => l.email === 'no-region@example.invalid');
    assert.deepEqual({ name: noRegionLead.name, phone: noRegionLead.phone, region: noRegionLead.region, source: noRegionLead.utm_source }, { name: 'Lê C', phone: '0988777666', region: '', source: 'ai-cskh' });
    assert.equal(leads.length, leadCount + 2);
    // Incomplete details for an unknown email open the prefilled form with the field to fix.
    await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await page.waitForURL(`**/${course}`);
    await page.goto(`${site}/${course}?email=half-link%40example.invalid&name=Tr%E1%BA%A7n%20B&phone=123&khuvuc=Sai%20G%C3%B2n`);
    await expect(page.getByText('Email này chưa đăng ký. Vui lòng kiểm tra số điện thoại rồi bấm đăng ký để nhận video.')).toBeVisible();
    await expect(page.locator('#v2-email')).toHaveValue('half-link@example.invalid');
    await expect(page.getByPlaceholder('Họ và tên')).toHaveValue('Trần B');
    await expect(page.getByPlaceholder('Số điện thoại')).toHaveValue('123');
    await expect(page.locator('select')).toHaveValue('Hồ Chí Minh');
    assert.equal(leads.length, leadCount + 2);
    const contactLeaks = [...events.map(e => String(e.data?.url || '') + String(e.data?.referrer || '')), ...(await page.evaluate(() => [...(window.dataLayer || []), ...window.externalTrackingCalls].map(e => JSON.stringify(e))))].filter(text => /0399545712|0911111111|0988777666|bot-lead|half-link|no-region|Nguy|khuvuc|sdt=/i.test(text));
    assert.deepEqual(contactLeaks, [], 'Contact details from links never reach tracked URLs, dataLayer or Pixel calls');
    console.log('PASS: contact links register new learners (normalized phone/region, ai-cskh source, one conversion), sign registered ones in without changing their data, prefill incomplete ones, and never leak the details.');
    if (course === 'dong-tien') {
      // Check the alternate landing page as well, including its lazy assets.
      await page.goto(`${site}/dong-tien/v1`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(page.locator('iframe[src*="player.vimeo.com"]')).toHaveCount(1);
    }
    const capiOn = getCourse(course).capi;
    // The form registration and the contact-link registrations; signing in through a link again sends nothing.
    const registered = [leads[0].id, leads.find(l => l.email === 'bot-lead@example.invalid').id, leads.find(l => l.email === 'no-region@example.invalid').id];
    assert.deepEqual(notified.filter(n => ['capi', 'webhook'].includes(n[0])), registered.flatMap(id => [...(capiOn ? [['capi', id]] : []), ...(getCourse(course).webhooks ? [['webhook', id]] : [])]), 'Registration integrations follow the course setting, once per new lead');
    assert.deepEqual(notified.filter(n => n[0] === 'milestone').map(n => n[1]), capiOn ? ['StartLearning', 'StartLearning', 'StartLearning'] : [], 'Learning milestones reach Meta once per learner (form and contact-link registrations)');
    const landingCapi = notified.filter(n => n[0] === 'track');
    assert.ok(!capiOn || landingCapi.some(n => n[1] === 'pageview'), 'Landing views of new visitors reach Meta');
    assert.ok(landingCapi.every(n => n[2].startsWith(`/${course}`) && !n[2].includes('/learn') && ['pageview', 'form_open', 'form_submit'].includes(n[1])), 'Only landing views, form opens and submissions reach Meta');
    if (!sharedTracking) {
      assert.deepEqual(await page.evaluate(() => window.externalTrackingCalls), []);
      assert.deepEqual(externalAppRequests, [], 'Application document makes no external requests');
    } else assert.ok(externalAppRequests.every(url => new URL(url).hostname === 'www.googletagmanager.com'));
    assert.deepEqual(legacy, []); assert.deepEqual(errors, []);
    if (productionSafe) {
      assert.equal(blockedWrites.filter(row => new URL(row.url).origin === new URL(site).origin).length, 0, 'Production mutations must be handled by local fixtures');
      console.log('PASS: production network guard active; mutations redirected exclusively to loopback fixture; service workers blocked.');
    }
    console.log(`PASS (${course}): registration, login, lessons, shared UTM/click IDs/session/cookies on both landing variants, ${sharedTracking ? 'browser Pixel/GTM and one registration event ID' : 'disabled external analytics'}, and Vimeo DNT. Isolated test catalog/storage only.`);
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'dong-tien-browser-')));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await pool.end(); process.exit(process.exitCode || 0); });
