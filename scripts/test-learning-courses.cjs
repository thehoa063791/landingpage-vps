// node scripts/test-learning-courses.cjs — course isolation for the shared learning stack.
// Uses an offline database (JSON fallback in a temp folder) and an in-memory CRM.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { getCourse, isCourse } = require('../src/learningCourses');
const { createRepository } = require('../src/learningRepository');
const { createLearningService } = require('../src/learningService');
const { createAdminService } = require('../src/learningAdmin');
const { createRouter } = require('../src/routes/learning');
const { createRouter: createAdminRouter } = require('../src/routes/learningAdmin');
const { discoverFunnels } = require('../src/funnels');
const { pool } = require('../src/db');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'learning-courses-test-'));
  const offline = Object.assign(new Error('test database offline'), { code: 'ECONNREFUSED' });
  const database = { query: async () => { throw offline; }, connect: async () => { throw offline; } };
  const leads = [], events = [], surveys = [], secret = 'isolated-test-secret-with-at-least-32-characters';
  const crm = { getRegistrations: async () => leads, getRegistrationById: async id => leads.find(l => l.id === id), insertRegistration: async row => { leads.push(row); }, tagLeadByPage: async () => {}, insertEvent: async row => { events.push(row); }, insertSurvey: async row => { surveys.push(row); }, getEvents: async () => events };
  const notified = { capi: [], webhooks: [], track: [], lead: [] };
  const integrations = {
    capi: {
      sendRegistrationEvents: async (req, record) => { notified.capi.push(record); },
      sendTrackEvent: async (req, event, data) => { notified.track.push([event, data.page_id]); },
      sendLeadEvent: async (req, record, name, id) => { notified.lead.push([record.page_id, name, id]); },
    },
    webhooks: { buildWebhookPayload: record => ({ page_id: record.page_id, attendance: record.attendance }), fireWebhooks: async payload => { notified.webhooks.push(payload); } },
    lookupGeo: async ip => ip === '203.0.113.9' ? { city: 'Hà Nội', region: 'Hà Nội', zip: '100000' } : null,
  };
  const stores = {}, services = {};
  for (const id of ['dong-tien', 'trading']) {
    stores[id] = createRepository({ course: id, database, directory, fallback: true });
    services[id] = createLearningService({ course: getCourse(id), store: stores[id], crm, secret, integrations });
  }
  let server;
  try {
    // Repository: every SQL statement is scoped to its course.
    const queries = [];
    await createRepository({ course: 'trading', database: { query: async (sql, params) => { queries.push([sql, params]); return { rows: [] }; } } }).get('lessons', 7);
    assert.match(queries[0][0], /learning_lessons where course=\$1 and key=\$2/); assert.deepEqual(queries[0][1], ['trading', '7']);

    // The same lesson ID in two courses stays separate.
    await stores['dong-tien'].update('lessons', '1', () => ({ id: 1, title: 'Dong Tien lesson', duration: 100, position: 1, vimeo_video_id: '111111111', is_visible: true }));
    await stores.trading.update('lessons', '1', () => ({ id: 1, title: 'Trading lesson', duration: 200, position: 1, vimeo_video_id: '222222222', is_visible: true }));
    for (const n of [2, 3, 4]) await stores.trading.update('lessons', String(n), () => ({ id: n, title: `Trading lesson ${n}`, duration: 200, position: n, vimeo_video_id: `22222222${n}`, is_visible: true }));

    const app = express(); app.use(express.json());
    app.use('/api/learning/:course', createRouter(id => services[id]));
    app.use('/admin/funnels/:course/learning', createAdminRouter(id => createAdminService({ course: getCourse(id), store: stores[id], crm, vimeo: { thumbnail: async () => '/stub-thumbnail.jpg' } }), (req, res, next) => next(), (req, res, next) => next()));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function request(route, body, token) {
      const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(process.env.LEAD_API_KEY ? { 'X-API-Key': process.env.LEAD_API_KEY } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, data: await response.json() };
    }
    const fields = { full_name: 'Test student', email: 'same@example.invalid', phone: '0901234567', region: 'Hà Nội', utm_source: 'test' };

    assert.equal((await request('/api/learning/richlife/register', fields)).status, 404, 'Only registered courses have learning APIs');
    assert.equal(isCourse('constructor'), false);

    const dong = await request('/api/learning/dong-tien/register', fields);
    const trade = await request('/api/learning/trading/register', fields);
    assert.equal(dong.status, 200); assert.equal(trade.status, 200);
    const [dongLead, tradeLead] = ['dong-tien', 'trading'].map(page => leads.find(l => l.page_id === page));
    assert.ok(dongLead && tradeLead && dongLead.id !== tradeLead.id, 'One email registers once per course');
    assert.equal(tradeLead.attendance, 'Free Workshop'); assert.equal(dongLead.attendance, undefined);
    assert.equal(trade.data.event_id, tradeLead.id, 'Browser conversion ID equals the CRM registration ID');

    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(notified.capi.map(r => r.id), [dongLead.id, tradeLead.id], 'Both courses send registration CAPI with the CRM ID');
    assert.deepEqual(notified.webhooks, [{ page_id: 'dong-tien', attendance: undefined }, { page_id: 'trading', attendance: 'Free Workshop' }], 'Leads of both courses reach n8n once');
    await request('/api/learning/trading/register', fields);
    await request('/api/learning/trading/login', { email: fields.email });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(notified.capi.length, 2, 'Repeat registration and login never notify again');
    await services.trading.register({ ...fields, email: 'geo@example.invalid' }, { ip: '203.0.113.9' });
    const geoLead = leads.find(l => l.email === 'geo@example.invalid');
    assert.deepEqual([geoLead.city, geoLead.state, geoLead.zip], ['Hà Nội', 'Hà Nội', '100000'], 'New leads get IP location like /api/register');
    leads.splice(leads.indexOf(geoLead), 1);
    assert.equal(leads.length, 2);

    // Sessions are course-bound.
    assert.equal((await request('/api/learning/dong-tien/profile', null, trade.data.access_token)).status, 401);
    const tradeLessons = (await request('/api/learning/trading/lessons', null, trade.data.access_token)).data;
    assert.deepEqual(tradeLessons.map(l => l.title), ['Trading lesson', 'Trading lesson 2', 'Trading lesson 3', 'Trading lesson 4']);
    assert.equal((await request('/api/learning/dong-tien/lessons', null, dong.data.access_token)).data[0].title, 'Dong Tien lesson');

    // Progress and events carry the course page ID.
    await request('/api/learning/trading/videos/1/progress', { lesson_id: 1, current_position: 200, furthest_position: 200, watched_ranges: [[0, 195]], playback_speed: 1 }, trade.data.access_token);
    assert.equal((await request('/api/learning/dong-tien/videos/1/progress', null, dong.data.access_token)).data.watch_percent, 0);
    await request('/api/learning/trading/track', { event: 'view_content', meta: { lesson_id: 2 }, tracking: { session_id: 's1', event_source_url: 'http://local/trading/learn/2' } }, trade.data.access_token);
    const view = events.filter(e => e.event === 'lesson_view').at(-1);
    assert.equal(view.data.page_id, 'trading'); assert.equal(view.data.registration_id, tradeLead.id);
    assert.equal(events.find(e => e.event === 'lesson_completed').data.page_id, 'trading');
    // Events table: milestone events only; Meta: course milestones once per learner.
    assert.deepEqual(events.filter(e => e.event === 'learning_progress' && e.data.registration_id === tradeLead.id).map(e => e.data.milestone), [25, 50, 75]);
    for (const id of [2, 3]) await request(`/api/learning/trading/videos/${id}/progress`, { lesson_id: id, current_position: 200, furthest_position: 200, watched_ranges: [[0, 195]], playback_speed: 1 }, trade.data.access_token);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(notified.lead.map(e => e[1]), ['StartLearning', 'CourseProgress50']);
    await request('/api/learning/trading/videos/4/progress', { lesson_id: 4, current_position: 200, furthest_position: 200, watched_ranges: [[0, 195]], playback_speed: 1 }, trade.data.access_token);
    await request('/api/learning/trading/videos/4/progress', { lesson_id: 4, current_position: 200, furthest_position: 200, watched_ranges: [[0, 200]], playback_speed: 1 }, trade.data.access_token);
    await request('/api/learning/trading/track', { event: 'view_content', meta: { lesson_id: 3 }, tracking: { session_id: 's1' } }, trade.data.access_token);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(notified.lead, [['trading', 'StartLearning', `StartLearning:${tradeLead.id}`], ['trading', 'CourseProgress50', `CourseProgress50:${tradeLead.id}`], ['trading', 'CompleteCourse', `CompleteCourse:${tradeLead.id}`]], 'Each course milestone reaches Meta once with a stable event ID');
    // Landing behaviour: new visitors' views reach Meta; lesson pages, returning learners and timers do not.
    const track = (event, data, token) => request('/api/learning/trading/track', { event, data: { event_id: `${event}-1`, ...data } }, token);
    await track('pageview', { url: 'http://local/trading', funnel_step: 'home' });
    await track('form_open', { url: 'http://local/trading' });
    await track('form_submit', { url: 'http://local/trading' });
    await track('pageview', { url: 'http://local/trading/learn/1', funnel_step: 'learn' });
    await track('pageview', { url: 'http://local/trading', returning_learner: true });
    await track('time_on_page', { url: 'http://local/trading', seconds: 30 });
    await track('pageview', { url: 'http://local/trading' }, trade.data.access_token);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(notified.track, [['pageview', 'trading'], ['form_open', 'trading'], ['form_submit', 'trading']]);
    await request('/api/learning/trading/cta', { lesson_id: 2, cta_id: 'cta_0123456789ab', action: 'view' }, trade.data.access_token);
    assert.equal(events.at(-1).event, 'learning_cta_view'); assert.equal(events.at(-1).data.page_id, 'trading');
    // The Next app only proxies listed learner routes; every route the lesson page calls must be there.
    const proxy = await fs.readFile(path.join(__dirname, '../pages/dong-tien/src/pages/api/[course]/learning/[...path].ts'), 'utf8');
    const proxied = new RegExp(proxy.match(/const allowed = \/(.+)\/;/)[1]);
    for (const route of ['login', 'profile', 'lessons', 'position', 'cta', 'complete-tour', 'courses/1/completion-status', 'videos/2/progress', 'videos/2/state']) assert.ok(proxied.test(route), `Next proxy allows /${route}`);
    assert.ok(!proxied.test('survey'), 'The removed survey route is not proxied');

    // Admin report and lesson management per course.
    assert.equal((await request('/admin/funnels/richlife/learning')).status, 404);
    const report = (await request('/admin/funnels/trading/learning')).data;
    assert.equal(report.students.length, 1); assert.equal(report.students[0].id, tradeLead.id);
    assert.equal(report.students[0].completed, 4); assert.equal(report.summary.sessions, 2);
    const tradingThumb = '/trading/api/learning/thumbnails/333333333-0123456789abcdef.jpg';
    const added = (await request('/admin/funnels/trading/learning/lessons', { title: 'New', vimeo_video_id: '333333333', duration: 60, thumbnail_url: tradingThumb })).data;
    assert.equal(added.thumbnail_url, tradingThumb);
    const foreign = (await request('/admin/funnels/trading/learning/lessons', { title: 'Foreign', vimeo_video_id: '444444444', duration: 60, thumbnail_url: '/dong-tien/api/learning/thumbnails/444444444-0123456789abcdef.jpg' })).data;
    assert.equal(foreign.thumbnail_url, '/stub-thumbnail.jpg', 'A thumbnail path of another course is not trusted');
    assert.equal((await stores['dong-tien'].list('lessons')).length, 1);

    // Admin funnels list both courses with the learning report.
    const funnels = discoverFunnels();
    for (const id of ['dong-tien', 'trading']) assert.equal(funnels.find(f => f.slug === id)?.learning, true);
    console.log('PASS: course-scoped SQL, lesson/learner/session isolation, per-course leads, registration CAPI for both courses, n8n once per course (Trading with attendance) and geo, milestone-only progress events, Meta course milestones once, landing-only behaviour CAPI, course page IDs on events/surveys, admin report/lessons per course, unknown course 404 and funnel discovery.');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await pool.end(); process.exit(process.exitCode || 0); });
