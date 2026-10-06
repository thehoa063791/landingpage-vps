const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { chromium, expect } = require('@playwright/test');
const { createRepository } = require('../src/dongTienRepository');
const { createLearningService } = require('../src/dongTienLearning');
const { createAdminService } = require('../src/dongTienAdmin');
const { createRouter } = require('../src/routes/dongTienAdmin');
const { pool } = require('../src/db');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dong-tien-admin-'));
  const offline = Object.assign(new Error('isolated test'), { code: 'ECONNREFUSED' });
  const store = createRepository({ database: { query: async () => { throw offline; }, connect: async () => { throw offline; } }, directory, fallback: true });
  const leads = [
    { id: 'learner-a', page_id: 'dong-tien', name: 'Học viên A', email: 'a@example.invalid', phone: '0900000001', region: 'Hà Nội', registered_at: '2026-10-05T01:00:00Z' },
    { id: 'learner-b', page_id: 'dong-tien', name: 'Học viên B', email: 'b@example.invalid', phone: '0900000002', region: 'Hồ Chí Minh', registered_at: '2026-10-06T01:00:00Z' },
    { id: 'other-page', page_id: 'other', name: 'Other page', email: 'a@example.invalid', registered_at: '2026-10-05T01:00:00Z' },
  ], events = [];
  const crm = { getRegistrations: async () => leads, getRegistrationById: async id => leads.find(l => l.id === id), getEvents: async () => events, insertEvent: async e => events.push(e), insertSurvey: async () => {} };
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
    await admin.saveLesson(1, { stage_id: stage.id, unlock_after_seconds: 5, show_popup: true, hidden_content: { questions: [{ id: 'goal', type: 'single_choice', text: 'Mục tiêu?', required: true, options: [{ value: 'save', label: 'Tích lũy' }] }] } });
    assert.equal((await learning.catalog()).find(l => l.id === 1).stage_title, 'Chương đầu');
    assert.equal((await learning.catalog())[0].id, 1, 'Classified chapters precede unclassified lessons');
    assert.equal((await store.get('lessons', 1)).thumbnail_url, localThumb('1209368302'));
    await assert.rejects(() => learning.submitSurvey(leads[0], { lesson_id: 1, answers: {} }), e => e.status === 400);
    await assert.rejects(() => learning.submitSurvey(leads[0], { lesson_id: 1, answers: { goal: 'wrong' } }), e => e.status === 400);
    await learning.submitSurvey(leads[0], { lesson_id: 1, answers: { goal: 'save' } });
    assert.equal((await admin.report()).students.find(s => s.id === 'learner-a').lessons[0].answers.goal, 'save');
    assert.equal((await learning.lessons(leads[0])).find(l => l.id === 1).progress.survey_submitted, true);
    await admin.saveStage(stage.id, { is_visible: false });
    assert.equal((await learning.catalog()).length, 1);
    await admin.saveStage(stage.id, { is_visible: true });
    await admin.reorder('lessons', [2, 1]);
    assert.equal((await admin.configuration()).lessons[0].id, 2);
    await assert.rejects(() => admin.reorder('lessons', [2, 2]), e => e.status === 400);
    await assert.rejects(() => admin.saveLesson(1, { unlock_after_seconds: 101 }), e => e.status === 400);
    await assert.rejects(() => admin.saveLesson(1, { hidden_content: 'invalid JSON' }), e => e.status === 400);
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
    app.get('/api/dong-tien/thumbnails/:filename', (_, res) => res.type('image/png').send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6tSIAAAAASUVORK5CYII=', 'base64')));
    app.use('/admin/auth/me', (_, res) => res.json({ user: { id: 'test-admin', full_name: 'Test admin', role: 'admin' } }));
    app.use('/admin/auth/config', (_, res) => res.json({ googleEnabled: false }));
    app.get('/admin/funnels/dong-tien', (_, res) => res.json({ id: 'dong-tien', name: 'Dòng Tiền', slug: 'dong-tien', revenue: 0, steps: [] }));
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
      await expect(page.getByRole('heading', { name: 'Quản lý khảo sát Dòng Tiền' })).toBeVisible();
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
      await page.getByRole('button', { name: '+ Thêm câu hỏi', exact: true }).click();
      await page.getByLabel('Câu 2', { exact: true }).fill('Bạn học được điều gì?');
      await page.getByRole('button', { name: 'Lưu', exact: true }).click();
      await expect(page.locator('.dt-lesson').filter({ hasText: 'Bài đã sửa từ admin' })).toHaveCount(1);
      assert.equal(JSON.parse((await store.get('lessons', 1)).hidden_content).questions.length, 2);
      await page.getByRole('button', { name: 'Đồng bộ từ Vimeo', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('Đã tải đầy đủ 3 video');
      await expect(page.getByLabel('Hiển thị các bài mới trên trang học', { exact: true })).toBeChecked();
      await page.getByLabel('Hiển thị các bài mới trên trang học', { exact: true }).uncheck();
      await page.getByRole('button', { name: 'Chọn tất cả 3 video', exact: true }).click();
      await page.getByRole('button', { name: 'Nhập 3 bài', exact: true }).click();
      await expect(page.locator('.dt-lesson')).toHaveCount(3);
      assert.equal((await store.get('lessons', 1)).title, 'Bài đã sửa từ admin');
      assert.equal(JSON.parse((await store.get('lessons', 1)).hidden_content).questions.length, 2);
      assert.equal((await store.get('lessons', 1208009837)).is_visible, false);
      assert.equal((await store.get('progress', 'learner-a:1')).is_completed, true);
      assert.equal((await store.get('lessons', 1208009837)).thumbnail_url, localThumb('1208009837'));
      assert.equal((await learning.catalog()).length, 2, 'New imports remain hidden until published');
      await expect(page.locator('.dt-lesson-thumbnail').first()).toBeVisible();
      await fs.mkdir('test-results', { recursive: true });
      await page.screenshot({ path: 'test-results/dong-tien-admin-lessons.png', fullPage: true });
      await page.getByRole('tab', { name: 'Tổng quan', exact: true }).click();
      await page.screenshot({ path: 'test-results/dong-tien-admin-overview.png', fullPage: true });
      assert.deepEqual(errors, []);
      console.log('PASS: admin UI, chapter creation, bulk classification, ordering within chapters, thumbnail display, import all Vimeo videos, preserved configuration/progress, learner reports and no JavaScript errors.');
    }
    console.log('PASS: internal admin statistics, unique viewers vs repeated visits, page isolation, date filters, stages/visibility/order/deletion, survey validation and answers, persisted progress and admin-only mutations.');
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'dong-tien-admin-')));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await pool.end(); process.exit(process.exitCode || 0); });
