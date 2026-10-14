// node scripts/test-partner-api.cjs — partner API v1 (src/partner/) end to end.
// Offline database (JSON fallback in a temp folder) and an in-memory CRM.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { getCourse } = require('../src/learningCourses');
const { createRepository, progressChanges } = require('../src/learningRepository');
const { createLearningService } = require('../src/learningService');
const { createAdminService } = require('../src/learningAdmin');
const { createClientStore } = require('../src/partner/clients');
const { createFacets } = require('../src/partner/facets');
const { createRouter, errorHandler } = require('../src/partner/router');
const { pool } = require('../src/db');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'partner-api-test-'));
  const offline = Object.assign(new Error('test database offline'), { code: 'ECONNREFUSED' });
  const database = { query: async () => { throw offline; }, connect: async () => { throw offline; } };
  const leads = [], events = [];
  // A fresh array per read, like storage's cache after an invalidation.
  const crm = { getRegistrations: async () => [...leads], getRegistrationById: async id => leads.find(l => l.id === id), insertRegistration: async row => { leads.push(row); }, tagLeadByPage: async () => {}, insertEvent: async row => { events.push(row); }, insertSurvey: async () => {}, getEvents: async () => events };
  const integrations = {
    capi: { sendRegistrationEvents: async () => {}, sendTrackEvent: async () => {}, sendLeadEvent: async () => {} },
    webhooks: { buildWebhookPayload: () => ({}), fireWebhooks: async () => {} },
    lookupGeo: async () => null,
    emailRejection: async () => null,
  };
  const secret = 'partner-test-secret-with-at-least-32-characters';
  const stores = {}, services = {};
  for (const id of ['dong-tien', 'trading']) {
    stores[id] = createRepository({ course: id, database, directory, fallback: true });
    services[id] = createLearningService({ course: getCourse(id), store: stores[id], crm, secret, integrations });
  }
  for (const n of [1, 2, 3, 4]) await stores.trading.update('lessons', String(n), () => ({ id: n, title: `Trading ${n}`, duration: 200, position: n, vimeo_video_id: `22222222${n}`, is_visible: true }));
  await stores['dong-tien'].update('lessons', '1', () => ({ id: 1, title: 'Dòng tiền 1', duration: 100, position: 1, vimeo_video_id: '111111111', is_visible: true }));

  const clients = createClientStore({ database, directory, fallback: true, cacheMs: 0 });
  const logs = [];
  const loggingClients = { ...clients, log: entry => logs.push(entry) };
  const facets = createFacets({ learning: { services: id => services[id], changes: opts => progressChanges({ ...opts, database, directory, fallback: true }), siteUrl: 'https://event.example' } });
  const app = express();
  app.use(express.json());
  app.use('/api/partner/v1', createRouter({ clients: loggingClients, crm, facets, secret }), errorHandler);
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/partner/v1`;
  async function call(route, { key, body, raw } = {}) {
    const response = await fetch(base + route, { method: body !== undefined || raw ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, ...(raw ? { body: raw } : body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, json: await response.json() };
  }

  try {
    // Person A: Trading with one email, Dòng Tiền with another email and the same phone.
    await services.trading.register({ full_name: 'Nguyễn Văn A', email: 'a@example.invalid', phone: '0901234567', region: 'Hà Nội' }, {});
    await sleep(5);
    await services['dong-tien'].register({ full_name: 'Nguyễn Văn A', email: 'a.second@example.invalid', phone: '+84 901 234 567', region: 'Hà Nội' }, {});
    await services.trading.register({ full_name: 'Trần B', email: 'b@example.invalid', phone: '0911111111', region: 'Khu vực khác' }, {});
    const leadA = leads.find(l => l.email === 'a@example.invalid'), leadB = leads.find(l => l.email === 'b@example.invalid');
    const watch = (lead, lesson, ranges, position) => services.trading.saveProgress(lead, lesson, { lesson_id: lesson, current_position: position, furthest_position: position, playback_speed: 1, watched_ranges: ranges });
    await watch(leadA, 1, [[0, 200]], 200);
    await sleep(5);
    await watch(leadA, 2, [[0, 100]], 100);

    const full = await clients.create({ name: 'AI CSKH', scopes: ['contact:basic', 'contact:phone', 'learning:read'] });
    const basic = await clients.create({ name: 'Basic only', scopes: ['contact:basic'] });
    const tradingOnly = await clients.create({ name: 'Trading only', scopes: ['contact:basic', 'learning:read'], courses: ['trading'] });
    const limited = await clients.create({ name: 'Limited', scopes: ['contact:basic'], rate_limit_per_minute: 3 });

    // Authentication.
    assert.equal((await call('/capabilities')).json.error.code, 'unauthorized');
    assert.equal((await call('/capabilities', { key: 'ptb_' + 'x'.repeat(32) })).status, 401);
    const caps = await call('/capabilities', { key: full.key });
    assert.equal(caps.status, 200);
    assert.equal(caps.json.meta.api_version, '1.0');
    assert.equal(caps.headers.get('x-request-id'), caps.json.meta.request_id);
    assert.deepEqual(caps.json.data.facets.map(f => [f.name, f.granted, f.change_feed]), [['learning', true, true]]);
    assert.deepEqual(caps.json.data.facets[0].courses.map(c => c.id), ['dong-tien', 'trading']);

    // Lookup by phone in another format merges both funnels into one contact.
    const byPhone = await call('/contacts/lookup', { key: full.key, body: { phone: '84901234567' } });
    assert.equal(byPhone.status, 200);
    const contact = byPhone.json.data;
    assert.match(contact.contact_id, /^ct_[A-Za-z0-9_-]{22}$/);
    assert.equal(contact.name, 'Nguyễn Văn A');
    assert.deepEqual(contact.identities, { emails: ['a@example.invalid', 'a.second@example.invalid'], phones: ['0901234567'] });
    assert.deepEqual(contact.funnels.map(f => f.page_id), ['trading', 'dong-tien']);
    assert.deepEqual(contact.learning.courses.map(c => c.course), ['dong-tien', 'trading']);
    const byEmail = await call('/contacts/lookup', { key: full.key, body: { email: 'A.Second@Example.invalid' } });
    assert.equal(byEmail.json.data.contact_id, contact.contact_id);

    // Progress: lesson 1 done, lesson 2 half watched, lessons 3-4 untouched.
    const trading = contact.learning.courses.find(c => c.course === 'trading');
    assert.equal(trading.status, 'in_progress');
    assert.equal(trading.completed_lessons, 1);
    assert.equal(trading.total_lessons, 4);
    assert.equal(trading.completion_percent, 25);
    assert.equal(trading.watched_seconds, 300);
    assert.equal(trading.total_seconds, 800);
    assert.equal(trading.watch_percent, 37.5);
    assert.equal(trading.days_since_last_activity, 0);
    assert.ok(trading.last_login_at && trading.started_at && trading.last_activity_at);
    assert.equal(trading.completed_at, null);
    assert.deepEqual(trading.current_lesson, { id: 2, title: 'Trading 2', stage: null, watch_percent: 50, completed: false });
    assert.deepEqual(trading.next_lesson, { id: 2, title: 'Trading 2', stage: null, watch_percent: 50, completed: false, remaining_seconds: 100 });
    assert.equal(trading.resume_url, 'https://event.example/trading/learn/2');
    assert.equal(trading.lessons, undefined);
    const dongTien = contact.learning.courses.find(c => c.course === 'dong-tien');
    assert.equal(dongTien.status, 'not_started');
    assert.equal(dongTien.current_lesson, null);
    assert.equal(dongTien.next_lesson.id, 1);
    assert.equal(dongTien.days_since_last_activity, null);

    // The admin report shows the same numbers.
    const report = await createAdminService({ course: getCourse('trading'), store: stores.trading, crm, vimeo: { thumbnail: async () => '' } }).report();
    const student = report.students.find(s => s.id === leadA.id);
    assert.equal(student.completed, trading.completed_lessons);
    assert.equal(student.watch_percent, trading.watch_percent);
    assert.equal(student.completion_percent, trading.completion_percent);
    // And the learner's own completion page.
    assert.equal((await services.trading.completion(leadA)).completed_videos, 1);

    // Finishing the course: next_lesson null, completed_at set, resume to the course.
    for (const n of [2, 3, 4]) await watch(leadA, n, [[0, 200]], 200);
    const done = (await call('/contacts/lookup', { key: full.key, body: { email: 'a@example.invalid', include: ['learning.lessons'] } })).json.data.learning.courses.find(c => c.course === 'trading');
    assert.equal(done.status, 'completed');
    assert.equal(done.next_lesson, null);
    assert.ok(done.completed_at);
    assert.equal(done.resume_url, 'https://event.example/trading/learn');
    assert.equal(done.lessons.length, 4);
    assert.deepEqual(Object.keys(done.lessons[0]).sort(), ['completed', 'completed_at', 'duration_seconds', 'id', 'last_position', 'position', 'stage', 'title', 'updated_at', 'watch_percent', 'watched_seconds']);

    // Scopes, includes and course limits.
    const basicView = (await call('/contacts/lookup', { key: basic.key, body: { email: 'a@example.invalid' } })).json.data;
    assert.equal(basicView.learning, undefined);
    assert.equal(basicView.identities.phones, undefined);
    const denied = await call('/contacts/lookup', { key: basic.key, body: { email: 'a@example.invalid', include: 'learning' } });
    assert.equal(denied.status, 403);
    assert.equal(denied.json.error.code, 'scope_denied');
    const bogus = await call(`/contacts/${contact.contact_id}?include=orders`, { key: full.key });
    assert.equal(bogus.status, 400);
    assert.equal(bogus.json.error.code, 'invalid_include');
    assert.deepEqual((await call('/contacts/lookup', { key: tradingOnly.key, body: { email: 'a@example.invalid' } })).json.data.learning.courses.map(c => c.course), ['trading']);
    assert.equal((await call('/contacts/lookup', { key: tradingOnly.key, body: { email: 'a@example.invalid' } })).json.data.identities.phones, undefined);

    // GET by ID, including the ID derived from the contact's second email (after a merge).
    const byId = await call(`/contacts/${contact.contact_id}`, { key: full.key });
    assert.equal(byId.status, 200);
    assert.equal(byId.json.data.learning.courses.length, 2);
    const alias = `ct_${crypto.createHmac('sha256', secret).update('email:a.second@example.invalid').digest('base64url').slice(0, 22)}`;
    assert.equal((await call(`/contacts/${alias}`, { key: full.key })).json.data.contact_id, contact.contact_id);
    assert.equal((await call('/contacts/ct_AAAAAAAAAAAAAAAAAAAAAA', { key: full.key })).json.error.code, 'contact_not_found');
    assert.equal((await call('/contacts/not-an-id', { key: full.key })).status, 404);

    // Lookup validation.
    assert.equal((await call('/contacts/lookup', { key: full.key, body: {} })).json.error.code, 'invalid_request');
    assert.equal((await call('/contacts/lookup', { key: full.key, body: { email: 'nope' } })).json.error.details.field, 'email');
    assert.equal((await call('/contacts/lookup', { key: full.key, body: { phone: '12' } })).json.error.details.field, 'phone');
    assert.equal((await call('/contacts/lookup', { key: full.key, body: { email: 'nobody@example.invalid' } })).status, 404);
    assert.equal((await call('/contacts/lookup', { key: full.key, raw: '{not json' })).json.error.code, 'invalid_json');
    assert.equal((await call('/nope', { key: full.key })).json.error.code, 'not_found');

    // Change feed: page through every change, then only new ones.
    assert.equal((await call('/changes', { key: basic.key })).json.error.code, 'scope_denied');
    assert.equal((await call('/changes?limit=0', { key: full.key })).status, 400);
    assert.equal((await call('/changes?cursor=garbage', { key: full.key })).json.error.code, 'invalid_cursor');
    let cursor = null, pages = 0;
    const seen = new Set();
    for (;;) {
      const page = await call(`/changes?limit=1${cursor ? `&cursor=${cursor}` : ''}`, { key: full.key });
      assert.equal(page.status, 200);
      page.json.data.forEach(item => { assert.equal(item.facet, 'learning'); seen.add(item.contact_id); });
      cursor = page.json.meta.next_cursor;
      pages++;
      if (!page.json.meta.has_more) break;
    }
    assert.equal(pages, 5); // four progress rows, then an empty page
    assert.deepEqual([...seen], [contact.contact_id]);
    await sleep(5);
    await watch(leadB, 1, [[0, 50]], 50);
    const fresh = await call(`/changes?cursor=${cursor}`, { key: full.key });
    assert.equal(fresh.json.data.length, 1);
    assert.equal(fresh.json.data[0].course, 'trading');
    assert.notEqual(fresh.json.data[0].contact_id, contact.contact_id);
    assert.equal((await call(`/changes?cursor=${fresh.json.meta.next_cursor}`, { key: full.key })).json.data.length, 0);
    assert.equal((await call(`/changes?since=${encodeURIComponent(new Date(Date.now() + 60000).toISOString())}`, { key: full.key })).json.data.length, 0);

    // Rate limit per key.
    for (let i = 0; i < 3; i++) assert.equal((await call('/capabilities', { key: limited.key })).status, 200);
    const limitedCall = await call('/capabilities', { key: limited.key });
    assert.equal(limitedCall.status, 429);
    assert.ok(Number(limitedCall.headers.get('retry-after')) > 0);
    assert.equal((await call('/capabilities', { key: full.key })).status, 200);

    // Revocation and listing; the stored file holds hashes, never keys.
    assert.equal(await clients.revoke(basic.client.id), true);
    assert.equal((await call('/capabilities', { key: basic.key })).json.error.code, 'invalid_api_key');
    assert.equal((await clients.list()).length, 4);
    const stored = await fs.readFile(path.join(directory, 'api_clients.json'), 'utf8');
    for (const created of [full, basic, tradingOnly, limited]) assert.ok(!stored.includes(created.key));

    // Access log entries carry IDs only, never emails or phone numbers.
    assert.ok(logs.length > 20);
    assert.ok(logs.some(entry => entry.contact_id === contact.contact_id && entry.facets.includes('learning') && entry.status === 200));
    assert.ok(!JSON.stringify(logs).match(/@example\.invalid|0901234567/));

    console.log('PASS: key auth/revocation/hashing, rate limit, contact merge across funnels by email and phone formats, contact_id aliases, phone scope, facet scopes/includes/course limits, learning summary (status, %, current/next lesson, resume URL, lessons) matching the admin report, completion, change feed paging/cursor/since, validation and JSON errors, PII-free access log.');
  } finally {
    server.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await pool.end(); process.exit(process.exitCode || 0); });
