const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const express = require('express');
const { createRepository } = require('../src/learningRepository');
const { createLearningService } = require('../src/learningService');
const { createRouter } = require('../src/routes/learning');
const { pool } = require('../src/db');

async function main() {
  const capi = require('../src/metaCapi');
  const capiOriginal = { sendTrackEvent: capi.sendTrackEvent, sendRegistrationEvents: capi.sendRegistrationEvents, sendLeadEvent: capi.sendLeadEvent };
  // Meta calls are recorded, never sent.
  const capiCalls = [];
  capi.sendTrackEvent = async (req, event) => { capiCalls.push(['track', event]); };
  capi.sendRegistrationEvents = async (req, record) => { capiCalls.push(['registration', record.id]); };
  capi.sendLeadEvent = async (req, record, name, id) => { capiCalls.push(['lead', name, id]); };
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dong-tien-test-'));
  const offline = Object.assign(new Error('test database offline'), { code: 'ECONNREFUSED' });
  const database = { query: async () => { throw offline; }, connect: async () => { throw offline; } };
  const store = createRepository({ database, directory, fallback: true });
  const leads = [], events = [], surveys = [], appendedForms = [], secret = 'isolated-test-secret-with-at-least-32-characters';
  const crm = { getRegistrations: async () => leads, getRegistrationById: async id => leads.find(l => l.id === id), insertRegistration: async row => { leads.push(row); }, tagLeadByPage: async () => {}, insertEvent: async row => { events.push(row); }, insertSurvey: async row => { surveys.push(row); }, appendRegistrationForm: async (id, form, options) => { appendedForms.push({ id, form, options }); } };
  const service = createLearningService({ store, crm, secret });
  let server;
  try {
    await store.update('lessons', '1', () => ({ id: 1, title: 'Test lesson 1', duration: 100, position: 1, vimeo_video_id: '123456789', is_visible: true }));
    await store.update('lessons', '2', () => ({ id: 2, title: 'Test lesson 2', duration: 100, position: 2, vimeo_video_id: '123456790', is_visible: true }));
    const app = express(); app.use(express.json()); app.use('/api/dong-tien', createRouter(service));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api/dong-tien/`;
    async function request(route, body, token) {
      const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(process.env.LEAD_API_KEY ? { 'X-API-Key': process.env.LEAD_API_KEY } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, data: /json/.test(response.headers.get('content-type') || '') ? await response.json() : null };
    }
    const fields = { full_name: 'Test student', email: ' TEST@example.invalid ', phone: '0901234567', region: 'Test region', page_id: 'wrong', utm_source: 'test', session_id: 'session-test' };
    const [a,b] = await Promise.all([request('register', fields), request('register', fields)]);
    const [created, repeated] = a.status === 200 ? [a, b] : [b, a];
    assert.equal(created.status, 200); assert.equal(leads.length, 1); assert.equal(leads[0].page_id, 'dong-tien'); assert.equal(leads[0].utm_source, 'test'); assert.equal(created.data.user.id, leads[0].id);
    assert.equal(created.data.event_id, leads[0].id, 'The new registration returns its browser conversion ID');
    assert.equal(repeated.status, 409, 'A registered email is told to log in'); assert.equal(repeated.data.code, 'already_registered'); assert.equal(repeated.data.access_token, undefined);
    assert.equal(events.filter(e => e.event === 'conversion').length, 1); assert.equal(events.find(e => e.event === 'conversion').event_id, leads[0].id);
    // Contact links (AI customer care): a registered email signs in; the lead keeps its data
    // and the link's details are added to its form history only.
    const linked = await request('register', { ...fields, full_name: 'Tên từ bot', phone: '0912345678', email: 'test@example.invalid', signin_if_registered: true, utm_source: 'ai-cskh' });
    assert.equal(linked.status, 200); assert.equal(linked.data.existing, true); assert.equal(linked.data.user.id, leads[0].id); assert.ok(linked.data.access_token);
    assert.equal(linked.data.event_id, undefined, 'Signing in through a link is not a new conversion');
    assert.equal(leads.length, 1); assert.equal(leads[0].name, 'Test student'); assert.equal(leads[0].phone, '0901234567');
    assert.deepEqual({ id: appendedForms[0].id, name: appendedForms[0].form.name, phone: appendedForms[0].form.phone, source: appendedForms[0].options.source, keep: appendedForms[0].options.update_latest }, { id: leads[0].id, name: 'Tên từ bot', phone: '0912345678', source: 'contact_link', keep: false });
    assert.equal(events.filter(e => e.event === 'conversion').length, 1);
    assert.equal((await request('register', { ...fields, signin_if_registered: 'true' })).status, 409, 'Only a boolean flag signs in');
    assert.equal((await request('register', { ...fields, phone: '12', signin_if_registered: true })).status, 400, 'Link details are validated like the form');
    const token = created.data.access_token;
    assert.equal((await request('login', { email: 'Test@Example.Invalid' })).data.user.id, leads[0].id);
    const missing = await request('login', { email: 'missing@example.invalid' }); assert.equal(missing.status, 404); assert.equal(missing.data.code, 'not_registered');
    leads.push({ id: 'other-page', page_id: 'richlife', email: 'other@example.invalid' });
    assert.equal((await request('login', { email: 'other@example.invalid' })).status, 404);
    assert.equal((await request('profile')).status, 401);
    assert.equal((await request('profile', null, jwt.sign({ page_id: 'dong-tien' }, secret, { subject: leads[0].id, audience: 'wrong', issuer: 'landingpage-admin' }))).status, 401);
    assert.equal((await request('profile', null, jwt.sign({ page_id: 'dong-tien' }, secret, { subject: leads[0].id, audience: 'dong-tien-learning', issuer: 'landingpage-admin', expiresIn: -1 }))).status, 401);
    assert.equal((await request('lessons', null, token)).data.length, 2);
    const progress = body => request('videos/1/progress', { lesson_id: 1, current_position: 100, furthest_position: 100, watched_ranges: [], playback_speed: 1, ...body }, token);
    assert.equal((await progress({})).data.watch_percent, 0, 'Seeking to the end must not count as watching');
    assert.equal((await request('position', { video_id: 1, watch_time: 100 }, token)).data.completed, false);
    assert.equal((await progress({ current_position: 60, watched_ranges: [[0,40],[20,60]] })).data.watch_percent, 60);
    assert.equal((await progress({ watched_ranges: [[-1,50]] })).status, 400);
    assert.equal((await progress({ playback_speed: 0 })).status, 400);
    assert.equal((await progress({ lesson_id: 2 })).status, 400);
    await Promise.all([progress({ watched_ranges: [[60,80]] }), progress({ watched_ranges: [[80,95]] })]);
    assert.equal((await request('videos/1/progress', null, token)).data.watch_percent, 95);
    await progress({ current_position: 20, watched_ranges: [[0,20]] });
    const saved = (await request('videos/1/progress', null, token)).data;
    assert.equal(saved.last_position, 20); assert.equal(saved.watch_percent, 95); assert.equal(saved.is_completed, true);
    assert.equal(events.filter(e => e.event === 'lesson_completed').length, 1);
    assert.equal((await request('courses/1/completion-status', null, token)).data.completion_percentage, 50);
    assert.equal((await request('survey', { lesson_id: 2, answers: { q1: 'test answer' } }, token)).status, 404, 'The lesson survey was removed');
    assert.equal((await request('cta', { lesson_id: 2, cta_id: 'cta_0123456789ab', action: 'click' }, token)).status, 200);
    assert.equal(events.at(-1).event, 'learning_cta_click'); assert.equal(events.at(-1).data.page_id, 'dong-tien'); assert.equal(events.at(-1).data.registration_id, leads[0].id);
    assert.equal((await request('cta', { lesson_id: 2, cta_id: 'cta_0123456789ab', action: 'click' })).status, 401);
    assert.equal((await request('videos/2/progress', null, token)).data.is_completed, false, 'A CTA click must not mark the video watched');
    await request('complete-tour', {}, token); assert.equal((await request('profile', null, token)).data.tour_completed, true);
    const second = await request('register', { ...fields, email: 'second@example.invalid' });
    assert.equal((await request('videos/1/progress', null, second.data.access_token)).data.watch_percent, 0);
    await request('track', { event: 'view_content', meta: { lesson_id: 1 }, tracking: { session_id: 'track-session', event_source_url: 'http://local/learn/1', utm: { utm_source: 'test' } } }, token);
    assert.equal(events.at(-1).data.registration_id, leads[0].id); assert.equal(events.at(-1).event, 'lesson_view');
    const stats = await service.stats(); assert.equal(stats.sessions[0].pct, 95); assert.equal(stats.users[0].progress.completed, 1); assert.equal(stats.answers.length, 0, 'No lesson survey answers are collected any more');
    const reloaded = createLearningService({ store: createRepository({ database, directory, fallback: true }), crm, secret });
    assert.equal((await reloaded.getProgress(leads[0], 1)).watch_percent, 95);
    const sqlError = Object.assign(new Error('migration missing'), { code: '42P01' });
    await assert.rejects(createRepository({ database: { query: async () => { throw sqlError; } }, directory, fallback: true }).list('lessons'), /migration missing/);
    await new Promise(resolve => setImmediate(resolve));
    const registrations = capiCalls.filter(c => c[0] === 'registration');
    assert.deepEqual(registrations.map(c => c[1]), [leads[0].id, leads.find(l => l.email === 'second@example.invalid').id], 'Registration CAPI once per new lead, never for repeats or logins');
    assert.deepEqual(capiCalls.filter(c => c[0] === 'lead').map(c => c[1]), ['StartLearning'], 'Learning milestones reach Meta once per learner');
    assert.equal(capiCalls.filter(c => c[0] === 'track').length, 0, 'Lesson views are not landing events');
    // Events table: milestones only, not every periodic save.
    assert.deepEqual(events.filter(e => e.event === 'learning_progress' && e.data.registration_id === leads[0].id).map(e => e.data.milestone), [25, 50, 75]);
    console.log('PASS: Meta CAPI once per new lead and milestone, progress events at 25/50/75/95% only, registration deduplication, email login/page isolation, token validation, course navigation data, watched-range merging/concurrency, seek handling, completion once, resume, CTA events, tour, learner isolation, local admin stats, persistent fallback and missing migration errors.');
  } finally {
    Object.assign(capi, capiOriginal);
    if (server) await new Promise(resolve => server.close(resolve));
    assert.ok(path.resolve(directory).startsWith(path.join(path.resolve(os.tmpdir()), 'dong-tien-test-')));
    await fs.rm(directory, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await pool.end(); process.exit(process.exitCode || 0); });
