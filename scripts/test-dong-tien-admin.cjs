const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { createRepository } = require('../src/learningRepository');
const { createLearningService } = require('../src/learningService');
const { createAdminService } = require('../src/learningAdmin');
const { createRouter } = require('../src/routes/learningAdmin');
const { pool } = require('../src/db');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dong-tien-admin-'));
  const offline = Object.assign(new Error('isolated test'), { code: 'ECONNREFUSED' });
  const store = createRepository({ database: { query: async () => { throw offline; }, connect: async () => { throw offline; } }, directory, fallback: true });
  const leads = [
    { id: 'learner-a', page_id: 'dong-tien', name: 'Học viên A', email: 'a@example.invalid', phone: '0900000001', region: 'Hà Nội', registered_at: '2026-10-05T01:00:00Z' },
    { id: 'learner-b', page_id: 'dong-tien', name: 'Học viên B', email: 'b@example.invalid', phone: '0900000002', region: 'Hồ Chí Minh', registered_at: '2026-10-06T01:00:00Z' },
    { id: 'other-page', page_id: 'other', name: 'Other page', email: 'a@example.invalid', registered_at: '2026-10-05T01:00:00Z' },
  ], events = [], settings = new Map();
  const crm = { getRegistrations: async () => leads, getRegistrationById: async id => leads.find(l => l.id === id), getEvents: async () => events, insertEvent: async e => events.push(e), insertSurvey: async () => {},
    getCrmSetting: async (key, fallback) => settings.has(key) ? structuredClone(settings.get(key)) : fallback, setCrmSetting: async (key, value) => { settings.set(key, structuredClone(value)); } };
  const localThumb = video => `/dong-tien/api/learning/thumbnails/${video.split('/')[0]}-0123456789abcdef.jpg`;
  const vimeo = { thumbnail: async video => localThumb(video), catalog: async () => ({ source: 'review', message: 'Đã tải đầy đủ 3 video từ folder Vimeo.', rows: [
    { id: 1209368302, title: 'Original Vimeo title', vimeo_video_id: '1209368302/35cac4328c', duration: 100, thumbnail_url: localThumb('1209368302') },
    { id: 1208009839, title: 'Second Vimeo title', vimeo_video_id: '1208009839/49a8cc09ef', duration: 100, thumbnail_url: localThumb('1208009839') },
    { id: 1208009837, title: 'New Vimeo lesson', vimeo_video_id: '1208009837/hash', duration: 100, thumbnail_url: localThumb('1208009837') },
  ] }) };
  const admin = createAdminService({ store, crm, vimeo });
  const learning = createLearningService({ store, crm, secret: 'isolated-admin-test-secret' });
  let server, browser;
  try {
    const first = await admin.saveLesson(null, { id: 1, title: 'Bài kiểm thử 1', vimeo_video_id: '1209368302/35cac4328c', duration: 100, is_visible: true });
    await admin.saveLesson(null, { id: 2, title: 'Bài kiểm thử 2', vimeo_video_id: '1208009839/49a8cc09ef', duration: 100, is_visible: true });
    await learning.saveProgress(leads[0], 1, { lesson_id: 1, current_position: 96, furthest_position: 96, watched_ranges: [[0, 96]], playback_speed: 1 });
    await learning.event('lesson_view', leads[0], { lesson_id: 1 });
    await learning.event('lesson_view', leads[0], { lesson_id: 1 });
    const report = await admin.report();
    assert.equal(report.summary.students, 2);
    assert.equal(report.summary.sessions, 2);
    assert.equal(report.lessons[0].viewers, 1);
    assert.equal(report.lessons[0].completion_rate, 100);
    assert.equal(report.summary.completion_rate, 0);
    assert.equal(report.students.find(s => s.id === 'learner-a').completed, 1);
    assert.equal((await admin.report({ dateFrom: '2026-10-06T00:00:00+07:00' })).summary.students, 1);
    await assert.rejects(() => admin.report({ dateFrom: 'invalid' }), e => e.status === 400);
    const stage = await admin.saveStage(null, { title: 'Chương đầu', is_visible: true });
    await admin.saveLesson(1, { stage_id: stage.id });
    assert.equal((await learning.catalog()).find(l => l.id === 1).stage_title, 'Chương đầu');
    assert.equal((await learning.catalog())[0].id, 1, 'Classified chapters precede unclassified lessons');
    assert.equal((await store.get('lessons', 1)).thumbnail_url, localThumb('1209368302'));
    // Answers of the former lesson survey stay readable in the admin; lessons no longer send it.
    await store.update('lessons', 1, previous => ({ ...previous, show_popup: true, hidden_content: JSON.stringify({ questions: [{ id: 'goal', type: 'single_choice', text: 'Mục tiêu?', options: [{ value: 'save', label: 'Tích lũy' }] }] }) }));
    await store.update('learners', leads[0].id, previous => ({ ...previous, registration_id: leads[0].id, survey_answers: { 1: { goal: 'save' } } }));
    assert.equal((await admin.report()).students.find(s => s.id === 'learner-a').lessons[0].answers.goal, 'save');
    assert.equal((await learning.lessons(leads[0])).find(l => l.id === 1).hidden_content, undefined);
    assert.equal(learning.submitSurvey, undefined);

    // Shared CTA library: targets per course, checked IDs, safe links, learner-facing fields only.
    const zaloBody = { name: 'Zalo cuối bài', title: 'Vào nhóm Zalo', type: 'zalo', button_label: 'Tham gia', url: 'https://zalo.me/g/test', trigger: 'end' };
    await assert.rejects(() => admin.saveCta(null, { ...zaloBody, url: 'javascript:alert(1)' }), e => e.status === 400);
    await assert.rejects(() => admin.saveCta(null, { ...zaloBody, url: '//evil.example' }), e => e.status === 400);
    await assert.rejects(() => admin.saveCta(null, { ...zaloBody, targets: { 'dong-tien': { scope: 'lessons', ids: [999] } } }), e => e.status === 400);
    await assert.rejects(() => admin.saveCta(null, { ...zaloBody, targets: { 'dong-tien': { scope: 'stages', ids: [] } } }), e => e.status === 400);
    await assert.rejects(() => admin.saveCta(null, { ...zaloBody, trigger: 'percent', trigger_value: 120 }), e => e.status === 400);
    const zalo = await admin.saveCta(null, { ...zaloBody, targets: { 'dong-tien': { scope: 'stages', ids: [stage.id] }, trading: { scope: 'all' } } });
    const note = await admin.saveCta(null, { name: 'Nhắc ghi chép', title: 'Ghi lại 3 ý chính nhé', type: 'message', button_label: 'ignored', url: 'https://ignored.example', trigger: 'percent', trigger_value: 50, display: 'overlay', targets: { 'dong-tien': { scope: 'lessons', ids: [2] } } });
    assert.equal(note.url, '', 'A message CTA has no link');
    // Media Library images live under PUBLIC_BASE_URL, which is plain http on a local machine.
    const savedBase = process.env.PUBLIC_BASE_URL;
    process.env.PUBLIC_BASE_URL = 'http://localhost:3001';
    assert.equal((await admin.saveCta(note.id, { image: 'http://localhost:3001/storage/cms-media/learning-cta/a.jpg' })).image, 'http://localhost:3001/storage/cms-media/learning-cta/a.jpg');
    await assert.rejects(() => admin.saveCta(note.id, { image: 'https://elsewhere.example/a.jpg' }), e => e.status === 400);
    await admin.saveCta(note.id, { image: '' });
    if (savedBase === undefined) delete process.env.PUBLIC_BASE_URL; else process.env.PUBLIC_BASE_URL = savedBase;
    const lessonCtas = async () => Object.fromEntries((await learning.lessons(leads[0])).map(l => [l.id, l.ctas.map(c => c.id)]));
    assert.deepEqual(await lessonCtas(), { 1: [zalo.id], 2: [note.id] });
    const sent = (await learning.lessons(leads[0])).find(l => l.id === 1).ctas[0];
    assert.equal(sent.name, undefined, 'Learners do not receive admin-only fields');
    assert.equal(sent.targets, undefined);
    assert.equal(sent.url, 'https://zalo.me/g/test');
    await admin.saveCta(zalo.id, { enabled: false });
    assert.deepEqual(await lessonCtas(), { 1: [], 2: [note.id] });
    await admin.saveCta(zalo.id, { enabled: true, targets: { 'dong-tien': { scope: 'all' } } });
    assert.equal((await admin.ctas()).ctas.find(c => c.id === zalo.id).targets.trading.scope, 'all', 'Editing one course keeps the other course targets');
    assert.deepEqual(await lessonCtas(), { 1: [zalo.id], 2: [zalo.id, note.id] });
    await learning.ctaEvent(leads[0], { lesson_id: 1, cta_id: zalo.id, action: 'view' });
    await learning.ctaEvent(leads[0], { lesson_id: 2, cta_id: zalo.id, action: 'view' });
    await learning.ctaEvent(leads[0], { lesson_id: 1, cta_id: zalo.id, action: 'click' });
    await assert.rejects(() => learning.ctaEvent(leads[0], { lesson_id: 1, cta_id: zalo.id, action: 'hover' }), e => e.status === 400);
    await assert.rejects(() => learning.ctaEvent(leads[0], { lesson_id: 1, cta_id: 'bad id', action: 'view' }), e => e.status === 400);
    assert.deepEqual((await admin.report()).cta_stats[zalo.id], { views: 1, clicks: 1 }, 'Statistics count learners, not repeated views');
    await admin.removeCta(note.id);
    assert.deepEqual((await admin.ctas()).ctas.map(c => c.id), [zalo.id]);
    await assert.rejects(() => admin.removeCta(note.id), e => e.status === 400);
    await admin.saveStage(stage.id, { is_visible: false });
    assert.equal((await learning.catalog()).length, 1);
    await admin.saveStage(stage.id, { is_visible: true });
    await admin.reorder('lessons', [2, 1]);
    assert.equal((await admin.configuration()).lessons[0].id, 2);
    await assert.rejects(() => admin.reorder('lessons', [2, 2]), e => e.status === 400);
    await admin.remove('stages', stage.id);
    assert.equal((await admin.configuration()).lessons.find(l => l.id === 1).stage_id, null);
    await admin.reorder('lessons', [1, 2]);
    await admin.remove('lessons', 2);
    assert.equal((await learning.catalog()).length, 1);
    assert.equal((await admin.report()).summary.completion_rate, 50);
    assert.equal((await store.get('progress', 'learner-a:1')).is_completed, true);
    await admin.saveLesson(null, { id: 2, title: 'Bài kiểm thử 2', vimeo_video_id: '1208009839/49a8cc09ef', duration: 100 });
    await assert.rejects(() => admin.assignLessons([1, 999], null), e => e.status === 400);
    await assert.rejects(() => admin.importVideos([1209368302, 999]), e => e.status === 400);

    const app = express(); app.use(express.json());
    const auth = (req, res, next) => { if (!req.headers['x-test-role']) return res.sendStatus(401); req.adminUser = { role: req.headers['x-test-role'] }; next(); };
    app.use('/admin/funnels/dong-tien/learning', createRouter(admin, auth));
    app.get('/api/learning/dong-tien/thumbnails/:filename', (_, res) => res.type('image/png').send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6tSIAAAAASUVORK5CYII=', 'base64')));
    app.use('/admin/auth/me', (_, res) => res.json({ user: { id: 'test-admin', full_name: 'Test admin', role: 'admin' } }));
    app.use('/admin/auth/config', (_, res) => res.json({ googleEnabled: false }));
    app.get('/admin/funnels/dong-tien', (_, res) => res.json({ id: 'dong-tien', name: 'Dòng Tiền', slug: 'dong-tien', learning: true, revenue: 0, steps: [] }));
    app.use(express.static(path.join(__dirname, '../public')));
    app.get(/^\/admin(?:\/.*)?$/, (_, res) => res.sendFile(path.join(__dirname, '../public/admin.html')));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(base + '/admin/funnels/dong-tien/learning')).status, 401);
    assert.equal((await fetch(base + '/admin/funnels/dong-tien/learning/stages', { method: 'POST', headers: { 'x-test-role': 'sale', 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Forbidden' }) })).status, 403);

    if (process.argv.includes('--browser')) {
      browser = await chromium.launch();
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { 'x-test-role': 'admin' } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/admin/view/funnels?funnel=dong-tien');
      await expect(page.getByRole('heading', { name: 'Quản lý khóa học · Dòng Tiền' })).toBeVisible();
      await expect(page.getByRole('tab', { name: /Thống kê Email/ })).toHaveCount(0);
      await page.getByRole('tab', { name: /Thống kê học viên/ }).click();
      await expect(page.locator('.dt-learning .react-table')).toContainText('Học viên A');
      await page.getByRole('textbox', { name: 'Tìm học viên' }).fill('a@example.invalid');
      await expect(page.locator('.dt-learning .react-table tbody tr')).toHaveCount(1);
      await page.getByRole('button', { name: 'Chi tiết', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('Tích lũy');
      await page.keyboard.press('Escape');
      await page.getByRole('tab', { name: /Danh sách bài giảng/ }).click();
      await page.getByRole('button', { name: '+ Thêm chương', exact: true }).click();
      await page.getByLabel('Tên chương', { exact: true }).fill('Chương tạo từ admin');
      await page.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(page.locator('.dt-stage')).toContainText('Chương tạo từ admin');
      await page.getByRole('button', { name: 'Chọn tất cả bài', exact: true }).click();
      await page.getByRole('combobox', { name: 'Chọn chương để phân loại', exact: true }).click();
      await page.getByRole('option', { name: 'Chương tạo từ admin', exact: true }).click();
      await page.getByRole('button', { name: 'Phân 2 bài vào chương', exact: true }).click();
      await expect.poll(async () => (await admin.configuration()).lessons.every(l => !!l.stage_id)).toBe(true);
      await page.getByRole('button', { name: `Đưa bài ${first.title} xuống`, exact: true }).click();
      await expect.poll(async () => (await admin.configuration()).lessons[0].id).toBe(2);
      const lessonCard = page.locator('.dt-lesson').filter({ hasText: first.title });
      await lessonCard.getByRole('button', { name: 'Sửa', exact: true }).click();
      await page.getByLabel('Tên bài giảng', { exact: true }).fill('Bài đã sửa từ admin');
      await expect(page.getByRole('button', { name: '+ Thêm câu hỏi', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(page.locator('.dt-lesson').filter({ hasText: 'Bài đã sửa từ admin' })).toHaveCount(1);
      await expect(page.locator('.dt-lesson').filter({ hasText: 'Bài đã sửa từ admin' })).toContainText('CTA: Zalo cuối bài · Khi xem hết bài');
      assert.equal(JSON.parse((await store.get('lessons', 1)).hidden_content).questions.length, 1, 'Stored survey data is kept');
      await page.getByRole('button', { name: 'Đồng bộ từ Vimeo', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('Đã tải đầy đủ 3 video');
      await expect(page.getByLabel('Hiển thị các bài mới trên trang học', { exact: true })).toBeChecked();
      await page.getByLabel('Hiển thị các bài mới trên trang học', { exact: true }).uncheck();
      await page.getByRole('button', { name: 'Chọn tất cả 3 video', exact: true }).click();
      await page.getByRole('button', { name: 'Nhập 3 bài', exact: true }).click();
      await expect(page.locator('.dt-lesson')).toHaveCount(3);
      assert.equal((await store.get('lessons', 1)).title, 'Bài đã sửa từ admin');
      assert.equal((await store.get('lessons', 1208009837)).is_visible, false);
      assert.equal((await store.get('progress', 'learner-a:1')).is_completed, true);
      assert.equal((await store.get('lessons', 1208009837)).thumbnail_url, localThumb('1208009837'));
      assert.equal((await learning.catalog()).length, 2, 'New imports remain hidden until published');
      await expect(page.locator('.dt-lesson-thumbnail').first()).toBeVisible();
      await fs.mkdir('test-results', { recursive: true });
      await page.screenshot({ path: 'test-results/dong-tien-admin-lessons.png', fullPage: true });
      await page.getByRole('tab', { name: 'CTA (1)', exact: true }).click();
      await expect(page.locator('.dt-cta-table')).toContainText('Zalo cuối bài');
      await expect(page.locator('.dt-cta-table')).toContainText('Trading: Tất cả bài');
      await page.getByRole('button', { name: '+ Tạo CTA', exact: true }).click();
      await page.getByLabel('Tên CTA (chỉ admin thấy)', { exact: true }).fill('Zoom giữa bài');
      await page.getByRole('radio', { name: 'Đăng ký Zoom', exact: true }).click();
      await expect(page.getByLabel('Link khi bấm nút', { exact: true })).toHaveValue('/zoom');
      await page.getByLabel('Tiêu đề', { exact: true }).fill('Đăng ký buổi Zoom tối nay');
      await page.locator('.dt-cta-dialog').getByRole('button', { name: 'Chọn từ thư viện', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Chọn ảnh từ thư viện' })).toBeVisible();
      assert.ok(await page.evaluate(() => { const box = document.querySelector('.ze-picker').getBoundingClientRect(); return !!document.elementFromPoint(box.left + box.width / 2, box.top + 24)?.closest('.ze-picker'); }), 'The Media Library picker opens above the CTA editor');
      await page.locator('.ze-picker .drawer-head-react button').click();
      await expect(page.locator('.ze-picker')).toHaveCount(0);
      await page.getByRole('combobox', { name: 'Thời điểm hiện', exact: true }).click();
      await page.getByRole('option', { name: 'Sau một khoảng thời gian', exact: true }).click();
      await page.getByLabel('Phút', { exact: true }).fill('2');
      await page.getByLabel('Giây', { exact: true }).fill('30');
      await page.getByRole('radio', { name: /Popup giữa màn hình/ }).click();
      await page.getByRole('radio', { name: 'Chọn từng bài', exact: true }).check();
      await page.locator('.dt-cta-picks').getByLabel('Bài đã sửa từ admin').check();
      await expect(page.locator('.dt-cta-phone.popup')).toContainText('Đăng ký buổi Zoom tối nay');
      await page.screenshot({ path: 'test-results/dong-tien-admin-cta-editor.png' });
      await page.getByRole('button', { name: 'Lưu CTA', exact: true }).click();
      await expect(page.locator('.dt-cta-table')).toContainText('Zoom giữa bài');
      const zoom = (await admin.ctas()).ctas.find(c => c.name === 'Zoom giữa bài');
      assert.deepEqual({ type: zoom.type, url: zoom.url, trigger: zoom.trigger, value: zoom.trigger_value, display: zoom.display, target: zoom.targets['dong-tien'], trading: zoom.targets.trading.scope }, { type: 'zoom', url: '/zoom', trigger: 'time', value: 150, display: 'popup', target: { scope: 'lessons', ids: [1] }, trading: 'none' });
      await page.screenshot({ path: 'test-results/dong-tien-admin-cta.png', fullPage: true });
      await page.getByRole('tab', { name: 'Tổng quan', exact: true }).click();
      await page.screenshot({ path: 'test-results/dong-tien-admin-overview.png', fullPage: true });
      assert.deepEqual(errors, []);
      console.log('PASS: admin UI, chapter creation, bulk classification, ordering within chapters, thumbnail display, import all Vimeo videos, CTA editor, preserved configuration/progress, learner reports and no JavaScript errors.');
    }
    console.log('PASS: internal admin statistics, unique viewers vs repeated visits, page isolation, date filters, stages/visibility/order/deletion, shared CTA library with per-course targets and statistics, legacy survey answers, persisted progress and admin-only mutations.');
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'dong-tien-admin-')));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await pool.end(); process.exit(process.exitCode || 0); });
