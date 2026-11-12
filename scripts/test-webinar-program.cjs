// node scripts/test-webinar-program.cjs [--screenshots <dir>] — weekly webinar funnel: cohort rules
// (src/webinarProgram.js), then the real /api/register + pages router on in-memory storage and the
// landing → thank-you → study page and /w/dong-tien flows in Chromium. Nothing leaves the machine:
// CAPI, webhooks and EverWebinar are recorded, external requests blocked.
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..');
const leads = [], sent = [], settingsStore = {};
const storage = {
  supabase: { from: () => { throw new Error('no database in this test'); } },
  getRegistrations: async () => leads,
  getCrmSetting: async (key, fallback) => settingsStore[key] ?? fallback,
  setCrmSetting: async (key, value) => { settingsStore[key] = value; },
  findRegistrationsByEmail: async email => leads.filter(l => l.email.toLowerCase() === String(email).trim().toLowerCase()),
  findRegistrationsByPhone: async () => [],
  findRegistrationInPage: async (page, email) => leads.find(l => l.page_id === page && l.email.toLowerCase() === String(email).trim().toLowerCase()) || null,
  appendRegistrationForm: async () => {},
  getRegistrationById: async id => leads.find(lead => lead.id === id) || null,
  insertRegistration: async row => { leads.push({ ...row }); },
  updateRegistration: async () => {},
  tagLeadByPage: async () => {},
  insertEvent: async () => {},
  countRegistrationsByPage: async () => 0,
  insertSurvey: async () => {},
  addLeadNote: async () => {},
};
const stub = (file, exports) => { require.cache[require.resolve(path.join(root, file))] = { id: file, filename: file, loaded: true, exports }; };
stub('src/storage.js', storage);
stub('src/metaCapi.js', { sendRegistrationEvents: async (req, record) => { sent.push(['capi', record.page_id]); }, sendTrackEvent: async () => {} });
stub('src/webhooks.js', { buildWebhookPayload: record => ({ email: record.email, page_id: record.page_id }), fireWebhooks: async payload => { sent.push(['webhook', payload]); }, hubcrmTracking: () => ({}) });
stub('src/emailValidation.js', { rejection: async () => null });
stub('src/contacts/registration.js', { funnelOfPage: page => page, personOf: async () => null, personFields: async () => ({}) });
const utils = require('../src/utils');
stub('src/utils.js', { ...utils, lookupGeo: async () => null });

const { startsOnFor, cohortOf, normalizeSettings, createRepository, withDevelopmentFile, createWebinarProgramService, useWebinarProgramService, MASK, SETTINGS_KEY } = require('../src/webinarProgram');

const vn = text => new Date(`${text}+07:00`);

function rules() {
  // The window runs from one Monday 15:00 to the next Monday 14:59 (2026-11-16 is a Monday).
  assert.equal(startsOnFor(vn('2026-11-09T14:59:59')), '2026-11-09');
  assert.equal(startsOnFor(vn('2026-11-09T15:00:00')), '2026-11-16');
  assert.equal(startsOnFor(vn('2026-11-11T21:00:00')), '2026-11-16');
  assert.equal(startsOnFor(vn('2026-11-15T23:59:00')), '2026-11-16');
  assert.equal(startsOnFor(vn('2026-11-16T00:30:00')), '2026-11-16');
  assert.equal(startsOnFor(vn('2026-11-16T14:59:00')), '2026-11-16');
  assert.equal(startsOnFor(vn('2026-11-16T15:00:00')), '2026-11-23');
  // During the study week a new registration waits for the next Monday.
  assert.equal(startsOnFor(vn('2026-11-18T20:30:00')), '2026-11-23');
  assert.equal(startsOnFor(vn('2026-11-16T14:00:00'), '13:00'), '2026-11-23');
  assert.equal(startsOnFor(new Date('2026-11-15T17:30:00Z')), '2026-11-16', 'Vietnam time, not UTC');
  const defaults = normalizeSettings();
  const cohort = cohortOf('2026-11-16', defaults, vn('2026-11-12T10:00:00'));
  assert.equal(cohort.label, 'Khóa 16/11');
  assert.equal(cohort.status, 'collecting');
  assert.equal(cohort.opens_at, vn('2026-11-09T15:00:00').toISOString());
  assert.equal(cohort.closes_at, vn('2026-11-16T15:00:00').toISOString());
  assert.deepEqual(cohort.sessions.map(s => s.at), ['16', '17', '18', '19'].map(d => vn(`2026-11-${d}T20:00:00`).toISOString()));
  assert.equal(cohortOf('2026-11-16', defaults, vn('2026-11-18T10:00:00')).status, 'running');
  assert.equal(cohortOf('2026-11-16', defaults, vn('2026-11-20T10:00:00')).status, 'done');
  assert.equal(cohortOf('2026-11-23', defaults, vn('2026-11-12T10:00:00')).status, 'upcoming');
  const numbered = normalizeSettings({ first_number: 3, first_starts_on: '2026-11-16' });
  assert.equal(cohortOf('2026-11-16', numbered).label, 'K3');
  assert.equal(cohortOf('2026-11-30', numbered).label, 'K5');
  const three = normalizeSettings({ sessions: defaults.sessions.map((s, i) => ({ ...s, enabled: i < 3 })) });
  assert.equal(cohortOf('2026-11-16', three).sessions.length, 3);
}

function memoryRepository(now = () => Date.now()) {
  const groups = new Map(), enrollments = [], joins = new Map(), links = new Map(), syncRows = new Map();
  return {
    enrollments, joins,
    groups: async dates => dates.filter(d => groups.has(d)).map(d => ({ starts_on: d, ...groups.get(d) })),
    group: async d => groups.get(d) || null,
    saveGroup: async (d, zalo_name, zalo_url) => { groups.set(d, { zalo_name, zalo_url }); },
    counts: async dates => dates.flatMap(d => ['landing', 'link'].map(source => { const own = enrollments.filter(e => e.starts_on === d && (e.source || 'landing') === source); return { starts_on: d, source, people: own.length, zalo_clicks: own.filter(e => e.zalo_clicked_at).length }; })),
    landingVisits: async () => [{ starts_on: '2026-11-16', people: 7 }],
    joinCounts: async () => [...joins.values()].filter(j => j.clicks > 0).map(j => { const e = enrollments.find(x => x.id === j.id); return { starts_on: e.starts_on, source: e.source || 'landing', position: j.position, people: 1 }; }),
    latest: async email => enrollments.filter(e => e.email === email).sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0] || null,
    byKey: async key => enrollments.find(e => e.access_key === key) || null,
    forWeek: async (email, d) => enrollments.find(e => e.email === email && e.starts_on === d) || null,
    insert: async row => { if (!enrollments.some(e => e.email === row.email && e.starts_on === row.starts_on)) enrollments.push({ id: `e${enrollments.length + 1}`, ...row }); },
    markZalo: async id => { enrollments.find(e => e.id === id).zalo_clicked_at = 'now'; },
    people: async d => enrollments.filter(e => e.starts_on === d).map(e => ({ ...e, joins: [...joins.values()].filter(j => j.id === e.id) })),
    links, linkEvent: async (slug, starts_on, kind, visitor) => { const key = `${slug}:${kind}:${visitor}`; links.set(key, { slug, starts_on, kind, hits: (links.get(key)?.hits || 0) + 1 }); },
    linkStats: async () => { const out = new Map(); for (const r of links.values()) { const k = `${r.slug}:${r.kind}`; const t = out.get(k) || { starts_on: r.starts_on, slug: r.slug, kind: r.kind, people: 0, hits: 0 }; t.people++; t.hits += r.hits; out.set(k, t); } return [...out.values()]; },
    room: async (id, position) => joins.get(`${id}:${position}`)?.room_url || '',
    recordJoin: async (id, position, room_url) => { const old = joins.get(`${id}:${position}`); joins.set(`${id}:${position}`, { ...old, id, position, room_url: room_url || old?.room_url || '', clicks: (old?.clicks || 0) + 1 }); },
    saveAttendance: async (id, position, a) => { joins.set(`${id}:${position}`, { clicks: 0, room_url: '', ...joins.get(`${id}:${position}`), id, position, ...a, attendance_at: 'now' }); },
    attendanceCounts: async () => [...joins.values()].filter(j => j.attendance_at).map(j => { const e = enrollments.find(x => x.id === j.id); return { starts_on: e.starts_on, source: e.source || 'landing', position: j.position, live: j.attended_live ? 1 : 0, replay_only: j.attended_replay && !j.attended_live ? 1 : 0, live_seconds: j.attended_live ? j.live_seconds : 0 }; }),
    syncRows, syncs: async dates => [...syncRows.values()].filter(r => dates.includes(r.starts_on)),
    saveSync: async (starts_on, position, r) => { const old = syncRows.get(`${starts_on}:${position}`); syncRows.set(`${starts_on}:${position}`, { starts_on, position, synced_at: new Date(now()).toISOString(), matched: r.error ? old?.matched || 0 : r.matched, attended: r.error ? old?.attended || 0 : r.attended, error: r.error || '' }); },
  };
}

async function service() {
  let clock = vn('2026-11-12T10:00:00');
  const repository = memoryRepository();
  const rooms = [];
  let down = false;
  const everwebinar = { registerSessionRoom: async args => { rooms.push(args); if (down) throw new Error('down'); return `https://room.example.test/${args.webinarId}/${args.lead.email}`; } };
  const crm = { getCrmSetting: storage.getCrmSetting, setCrmSetting: storage.setCrmSetting, getRegistrationById: async () => ({ name: 'Nguyễn Văn A' }) };
  const hooks = [];
  const webhooks = { buildWebhookPayload: lead => ({ event: 'new_registration', name: lead.name }), fireWebhooks: async payload => { hooks.push(payload); } };
  const s = createWebinarProgramService({ repository, crm, everwebinar, webhooks, now: () => clock });
  const defaults = normalizeSettings();
  await assert.rejects(s.saveSettings({ cutoff_time: '25:00' }), /Mốc chốt/);
  await assert.rejects(s.saveSettings({ first_number: 3, first_starts_on: '2026-11-17' }), /thứ 2/);
  await assert.rejects(s.saveSettings({ first_number: 3 }), /cả hai/);
  await assert.rejects(s.saveSettings({ sessions: defaults.sessions.map(x => ({ ...x, enabled: false })) }), /ít nhất một/);
  await assert.rejects(s.saveSettings({ sessions: [{ weekday: 1, time: '20:00', direct_url: 'http://x' }] }), /https/);
  const body = { first_number: 3, first_starts_on: '2026-11-16', sessions: defaults.sessions.map((x, i) => ({ ...x, webinar_id: String(161 + i), direct_url: `https://direct.example.test/${i + 1}` })) };
  const saved = await s.saveSettings({ ...body, api_key: 'secret-key' });
  assert.equal(saved.api_key, MASK, 'the key never goes back to the browser');
  assert.equal(settingsStore[SETTINGS_KEY].api_key, 'secret-key');
  await s.saveSettings({ ...body, api_key: MASK });
  assert.equal(settingsStore[SETTINGS_KEY].api_key, 'secret-key', 'the masked value keeps the saved key');
  await assert.rejects(s.saveCohort('2026-11-17', {}), /không hợp lệ/);
  await assert.rejects(s.saveCohort('2026-11-16', { zalo_url: 'https://example.com/g/1' }), /zalo\.me/);
  await s.saveCohort('2026-11-16', { zalo_name: 'K3', zalo_url: 'https://zalo.me/g/abc' });

  // The general link follows the cohort rule: Friday 13/11 belongs to the week of 16/11.
  clock = vn('2026-11-13T10:00:00');
  assert.equal(await s.currentLink(), '/w/dong-tien/20h-16-11-26');
  clock = vn('2026-11-16T14:59:00');
  assert.equal(await s.currentLink(), '/w/dong-tien/20h-16-11-26');
  // One link per session: the session on now, else the next one, while the week studies.
  clock = vn('2026-11-16T15:00:00');
  assert.equal(await s.currentLink(), '/w/dong-tien/20h-16-11-26');
  clock = vn('2026-11-16T22:30:00');
  assert.equal(await s.currentLink(), '/w/dong-tien/20h-16-11-26', 'session 1 still on');
  clock = vn('2026-11-16T23:30:00');
  assert.equal(await s.currentLink(), '/w/dong-tien/20h-17-11-26', 'Monday night: Tuesday next');
  clock = vn('2026-11-18T10:00:00');
  assert.equal(await s.currentLink(), '/w/dong-tien/20h-18-11-26');
  clock = vn('2026-11-19T22:00:00');
  assert.equal(await s.currentLink(), '/w/dong-tien/20h-19-11-26', 'Thursday evening, last session still on');
  clock = vn('2026-11-19T23:30:00');
  assert.equal(await s.currentLink(), '/w/dong-tien/20h-23-11-26');
  clock = vn('2026-11-21T10:00:00');
  assert.equal(await s.currentLink(), '/w/dong-tien/20h-23-11-26');
  clock = vn('2026-11-16T15:00:00');
  assert.equal(await s.linkOpen('20h-16-11-26'), true, 'the running week keeps its link');
  assert.equal(await s.linkOpen('20h-23-11-26'), true);
  assert.equal(await s.linkOpen('20h-30-11-26'), false, 'a later week is not open yet');
  assert.equal(await s.linkOpen('20h-17-11-26'), true, 'session 2 has its own link');
  assert.equal(await s.linkOpen('20h-20-11-26'), false, 'no session on Friday');
  assert.equal(await s.linkOpen('21h-18-11-26'), true, 'the day decides; the hour is shown only');
  assert.equal(await s.linkOpen('abc'), false);
  clock = vn('2026-11-12T10:00:00');
  const first = await s.enroll({ id: 'r1', email: ' An@Example.invalid ' });
  assert.equal(first.label, 'K3');
  assert.equal(first.starts_on, '2026-11-16');
  assert.equal(first.open_position, null);
  assert.ok(!JSON.stringify(first).includes('example.invalid'), 'the public view has no email');
  assert.equal((await s.check({ email: 'AN@example.invalid' })).key, first.key);
  assert.equal((await s.check({ email: 'other@example.invalid' })).found, false);
  assert.equal(await s.go(first.key, {}), null, 'no room before the session opens');

  // During the study week: the landing's rule gives a new registration next Monday.
  // The room opens at the start itself, not before.
  clock = vn('2026-11-18T19:59:00');
  assert.equal((await s.session(first.key)).open_position, null, 'not a minute early');
  clock = vn('2026-11-18T20:02:00');
  const late = await s.enroll({ id: 'r2', email: 'late@example.invalid' });
  assert.equal(late.starts_on, '2026-11-23');
  assert.equal(late.label, 'K4');
  assert.equal(await s.go(late.key, {}), null, 'a later cohort cannot enter tonight');
  assert.equal((await s.session(first.key)).open_position, 3);
  // A personal room on the first click, then the same room without a second registration.
  const url = await s.go(first.key, { ip: '1.2.3.4', via: '20h-16-11-26' });
  assert.equal(url, 'https://room.example.test/163/an@example.invalid');
  assert.equal(rooms[0].at, '2026-11-18 20:00');
  assert.equal(rooms[0].apiKey, 'secret-key');
  assert.equal(rooms[0].lead.phone, undefined, 'the phone number is not sent');
  assert.equal(await s.go(first.key, {}), url);
  assert.equal(rooms.length, 1);
  assert.equal(repository.joins.get('e1:3').clicks, 2);
  // EverWebinar down: the direct link, and the next click tries again.
  down = true;
  clock = vn('2026-11-19T20:30:00');
  assert.equal(await s.go(first.key, {}), 'https://direct.example.test/4');
  assert.equal(repository.joins.get('e1:4').room_url, '');
  assert.equal(await s.zalo(first.key), 'https://zalo.me/g/abc');
  assert.equal(await s.zalo(late.key), null, 'no group set for that cohort');

  // After the cohort: told it ended; moved to the group now collecting.
  clock = vn('2026-11-20T10:00:00');
  assert.equal((await s.session(first.key)).ended, true);
  const again = await s.rejoin(first.key);
  assert.equal(again.starts_on, '2026-11-23');
  assert.notEqual(again.key, first.key);

  assert.deepEqual(await s.linkEvent({ slug: 'xyz', kind: 'visit', visitor: 'a' }), { success: false });
  const list = await s.people('2026-11-16');
  assert.equal(list.cohort.label, 'K3');
  assert.equal(list.people.length, 1);
  assert.equal(list.people[0].name, 'Nguyễn Văn A');
  assert.equal(list.people[0].email, 'an@example.invalid');
  assert.deepEqual(list.people[0].joins.map(j => j.position), [3, 4]);
  await assert.rejects(s.people('2026-11-17'), /không hợp lệ/);
  // Admin room check: the API room with the key, or the direct link and why.
  down = false;
  assert.deepEqual(await s.testRoom(2, 'Admin@Example.invalid'), { source: 'api', url: 'https://room.example.test/162/admin@example.invalid' });
  down = true;
  const fallback = await s.testRoom(2, 'admin@example.invalid');
  assert.equal(fallback.source, 'direct');
  assert.equal(fallback.url, 'https://direct.example.test/2');
  assert.equal(fallback.problem, 'down');
  await assert.rejects(s.testRoom(9, 'a@example.invalid'), /chưa bật/);
  const view = await s.overview();
  assert.equal(view.cohorts[0].links[0].path, '/w/dong-tien/20h-16-11-26');
  assert.deepEqual(view.cohorts[0].links.map(l => l.slug), ['20h-16-11-26', '20h-17-11-26', '20h-18-11-26', '20h-19-11-26']);
  assert.deepEqual(view.cohorts[0].links.map(l => l.position), [1, 2, 3, 4]);
  // The two flows apart: landing seats with landing views, link seats with link opens.
  const split = view.cohorts[0].flows;
  assert.equal(split.landing.visitors, 7);
  assert.equal(split.landing.people + split.link.people, view.cohorts[0].people);
  assert.equal(split.landing.people, 1, 'the K3 seat from the landing');
  assert.deepEqual(split.landing.session_joins, [0, 0, 1, 1]);
  assert.equal(view.cohorts[0].links[0].entered, 1);
  assert.ok(!JSON.stringify(view).includes('secret-key'));
  assert.equal(view.cohorts[0].starts_on, '2026-11-16', 'nothing before the first cohort');
  const k3 = view.cohorts[0], k4 = view.cohorts[1];
  assert.equal(k3.people, 1);
  assert.equal(k3.zalo_clicks, 1);
  assert.deepEqual(k3.session_joins, [0, 0, 1, 1]);
  assert.equal(k4.people, 2);
  assert.equal(k4.zalo_name_suggested, 'PHƯƠNG PHÁP XÂY DỰNG DÒNG TIỀN K4');
  // Direct link on Wednesday evening: a newcomer joins this week, tonight; someone already
  // down for next week also gets in tonight; on Friday the link's week no longer takes anyone.
  clock = vn('2026-11-18T20:10:00');
  const viaLink = await s.enroll({ id: 'r9', email: 'link@example.invalid' }, { week: '20h-16-11-26' });
  assert.equal(viaLink.starts_on, '2026-11-16');
  assert.equal(viaLink.open_position, 3);
  const hooksBeforeLink = hooks.length;
  const tonight = await s.enterWeek({ key: late.key, slug: '20h-16-11-26' });
  assert.equal(hooks.length, hooksBeforeLink + 1);
  assert.equal(hooks.at(-1).webinar_source, 'link');
  assert.equal(hooks.at(-1).webinar_starts_on, '2026-11-16');
  assert.equal(hooks.at(-1).webinar_cohort_status, 'dang_hoc', 'the week studying now');
  assert.equal(tonight.starts_on, '2026-11-16');
  assert.equal(tonight.open_position, 3);
  assert.equal((await s.check({ email: 'late@example.invalid' })).key, late.key, 'their own week stays the newest');
  assert.equal((await repository.forWeek('link@example.invalid', '2026-11-16')).source, 'link');
  assert.equal((await repository.forWeek('late@example.invalid', '2026-11-16')).source, 'link');
  assert.equal((await repository.forWeek('late@example.invalid', '2026-11-23')).source, 'landing');
  const afterLink = (await s.overview()).cohorts.find(c => c.starts_on === '2026-11-16').flows;
  assert.equal(afterLink.link.people, 2);
  assert.equal((await s.enterWeek({ key: late.key, slug: '20h-23-11-26' })).starts_on, '2026-11-23', 'a week not studying yet: their own page');
  clock = vn('2026-11-20T10:00:00');
  // Someone in this week through the direct link who then registers on the landing: the
  // landing's rule, next week (and this week's seat stays).
  clock = vn('2026-11-18T21:00:00');
  const before = hooks.length;
  const landingAfterLink = await s.enroll({ id: 'r9', email: 'link@example.invalid' });
  assert.equal(landingAfterLink.starts_on, '2026-11-23');
  // A known person's new seat goes to n8n as webinar_enrolled; the same seat again does not.
  assert.equal(landingAfterLink.new_seat, true);
  assert.equal(hooks.length, before + 1);
  const enrolled = hooks.at(-1);
  assert.equal(enrolled.event, 'webinar_enrolled');
  assert.equal(enrolled.page_id, 'webinar-4day');
  assert.equal(enrolled.is_repeat, true);
  assert.equal(enrolled.webinar_starts_on, '2026-11-23');
  assert.equal(enrolled.webinar_source, 'landing');
  assert.equal(enrolled.webinar_cohort_status, 'sap_hoc', 'the next week');
  assert.equal(enrolled.name, 'Nguyễn Văn A');
  assert.match(enrolled.event_id, /^enrolled-/);
  const sameAgain = await s.enroll({ id: 'r9', email: 'link@example.invalid' });
  assert.equal(sameAgain.new_seat, false);
  assert.equal(hooks.length, before + 1, 'no webhook for the same seat');
  // A brand-new person (quiet): their new_registration carries it, no second webhook.
  const quietSeat = await s.enroll({ id: 'r11', email: 'quiet@example.invalid' }, { quiet: true });
  assert.equal(quietSeat.new_seat, true);
  assert.equal(hooks.length, before + 1);
  assert.ok(await repository.forWeek('link@example.invalid', '2026-11-16'), 'this week stays');
  clock = vn('2026-11-20T10:00:00');
  assert.equal((await s.enroll({ id: 'r10', email: 'fri@example.invalid' }, { week: '20h-16-11-26' })).starts_on, '2026-11-23');
  for (const key of Object.keys(settingsStore)) delete settingsStore[key];
}

async function browserFlow() {
  let clock = vn('2026-11-12T10:00:00');
  const repository = memoryRepository();
  const s = createWebinarProgramService({ repository, crm: { ...storage }, everwebinar: { registerSessionRoom: async () => 'http://127.0.0.1:9/room' }, now: () => clock });
  useWebinarProgramService(s);
  await s.saveSettings({ first_number: 3, first_starts_on: '2026-11-16', api_key: 'k', sessions: normalizeSettings().sessions.map((x, i) => ({ ...x, webinar_id: String(161 + i) })) });
  await s.saveCohort('2026-11-16', { zalo_name: 'PHƯƠNG PHÁP XÂY DỰNG DÒNG TIỀN K3', zalo_url: 'https://zalo.me/g/demo-k3' });

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(root, 'public')));
  const funnelAssets = express.static(path.join(root, 'pages'), { index: false, redirect: false });
  app.use('/p', (req, res, next) => /\.html$/i.test(req.path) ? next() : funnelAssets(req, res, next));
  app.use('/api/webinar-program', require('../src/routes/webinarProgramAdmin').createPublicRouter());
  app.use('/api', require('../src/routes/api'));
  app.use('/', require('../src/routes/pages'));
  const server = await new Promise(resolve => { const r = app.listen(0, '127.0.0.1', () => resolve(r)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const shots = process.argv.includes('--screenshots') ? process.argv[process.argv.indexOf('--screenshots') + 1] : '';
  const browser = await chromium.launch();
  const blockOutside = route => route.request().url().startsWith(base) ? route.continue() : route.abort();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route('**/*', blockOutside);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/webinar-dong-tien?utm_source=test&utm_term=12345`);
    // Copy keeps Vietnamese words together with non-breaking spaces; compare it as read.
    const read = async selector => (await page.textContent(selector)).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    assert.match(await read('h1'), /thay đổi tư duy tài chính của bạn mãi mãi/);
    assert.match(await page.getAttribute('.hero-video iframe', 'src'), /player\.vimeo\.com\/video\/1246166503/);
    await page.waitForFunction(() => document.querySelector('#schedule-summary').textContent.includes('16'));
    assert.match(await read('#schedule-summary'), /4 buổi tối 16, 17, 18, 19\/11, từ 20:00/);
    // Each evening of the journey shows its date and hour from the schedule.
    assert.equal(await read('[data-session="3"]'), '20:00 Thứ 4, 18/11');
    assert.match(await read('#info-schedule'), /16, 17, 18, 19\/11, từ 20:00/);
    // The hero's headline and action fit the first screen at 1280 wide; the action leads to the form.
    const box = await page.locator('.hero .btn').first().boundingBox();
    assert.ok(box.y + box.height <= 900, `hero action at ${box.y}`);
    assert.equal(await page.getAttribute('.hero .btn', 'href'), '#dang-ky');
    // The photographs are served from the page's own folder.
    assert.equal((await page.request.get(`${base}/p/webinar-dong-tien/img/DSC04158.webp`)).status(), 200);
    if (shots) await page.screenshot({ path: path.join(shots, 'landing-desktop.png'), fullPage: true });

    await page.click('#registration-form button[type="submit"]');
    assert.match(await page.textContent('#form-error'), /họ và tên/);
    await page.fill('#name', 'Nguyễn Văn Test');
    await page.fill('#phone', '0901 234 567');
    await page.fill('#email', 'Test@Example.invalid');
    await page.click('#registration-form button[type="submit"]');
    await page.waitForURL(/\/webinar-dong-tien\/thank-you$/);
    await page.waitForSelector('#ready:not([hidden])');
    assert.equal(leads.length, 1);
    assert.equal(leads[0].page_id, 'webinar-dong-tien');
    assert.equal(leads[0].utm_term, '12345');
    assert.ok(!/\bK\d+\b|Khóa \d/.test(await page.textContent('body')), 'no cohort name on the thank-you page');
    assert.match((await page.textContent('#first-at')).replace(/ /g, ' '), /20:00 Thứ 2, 16\/11/);
    const key = repository.enrollments[0].access_key;
    assert.equal(await page.getAttribute('#zalo', 'href'), `/w/dong-tien/zalo/${key}`);
    // Only the Zalo button: the session 1 link comes by email (HubCRM), the page says to check it.
    assert.equal(await page.locator('#join').count(), 0);
    assert.equal(await page.locator('#ready a').count(), 1);
    assert.ok(await page.isVisible('#email-note'));
    assert.match((await page.textContent('#email-note')).replace(/ /g, ' '), /Kiểm tra email.*Spam/s);
    // A congratulation and the first evening only; the full schedule is no longer listed.
    assert.match((await page.textContent('h1')).replace(/ /g, ' '), /Chúc mừng bạn đã đăng ký thành công/);
    assert.match((await page.textContent('.lead')).replace(/ /g, ' '), /Buổi đầu tiên sẽ diễn ra vào 20:00 Thứ 2, 16\/11\. Bạn nhớ tham dự nhé!/);
    assert.equal(await page.locator('#schedule').count(), 0);
    if (shots) await page.screenshot({ path: path.join(shots, 'thank-you.png'), fullPage: true });
    const hook = sent.find(([kind]) => kind === 'webhook')[1];
    assert.equal(hook.webinar_cohort, 'K3');
    assert.equal(hook.page_id, 'webinar-4day', 'the funnel name n8n sees');
    assert.equal(hook.event_source, 'webinar-4day');
    assert.equal(hook.webinar_cohort_status, 'sap_hoc');
    assert.equal(leads[0].page_id, 'webinar-dong-tien', 'inside the system the funnel keeps its id');
    assert.equal(hook.webinar_starts_on, '2026-11-16');
    assert.equal(hook.webinar_zalo_url, 'https://zalo.me/g/demo-k3');
    assert.ok(hook.webinar_join_url.endsWith(`/w/dong-tien/vao/${key}`));
    assert.ok(sent.some(([kind]) => kind === 'capi'));
    // The Zalo button counts the click and goes on to the cohort's group.
    const zalo = await page.request.get(`${base}/w/dong-tien/zalo/${key}`, { maxRedirects: 0 });
    assert.equal(zalo.status(), 302);
    assert.equal(zalo.headers().location, 'https://zalo.me/g/demo-k3');

    // Same email again on the landing: same cohort, no second lead.
    await page.goto(`${base}/webinar-dong-tien`);
    await page.fill('#name', 'Nguyễn Văn Test');
    await page.fill('#phone', '0901234567');
    await page.fill('#email', 'test@example.invalid');
    await page.click('#registration-form button[type="submit"]');
    await page.waitForURL(/thank-you$/);
    await page.waitForSelector('#ready:not([hidden])');
    assert.equal(leads.length, 1);
    assert.equal(repository.enrollments.length, 1);
    assert.match(await page.textContent('#repeat'), /đã đăng ký trước đó.*giữ như cũ/);
    assert.equal(sent.filter(([kind, p]) => kind === 'webhook' && p.event === 'webinar_enrolled').length, 0, 'same seat: no webhook');
    await page.reload();
    await page.waitForSelector('#ready:not([hidden])');
    assert.ok(await page.isHidden('#repeat'), 'the note shows once');

    // Before the evening: the study page says when, no button into the room.
    await page.goto(`${base}/w/dong-tien/vao/${key}`);
    await page.waitForFunction(() => document.querySelector('#countdown') && !document.querySelector('#countdown').hidden);
    assert.match(await page.textContent('#heading'), /20:00 Thứ 2, 16\/11/);
    assert.equal(await page.getAttribute('#go', 'href'), null, 'the play ring is not a link yet');
    if (shots) await page.screenshot({ path: path.join(shots, 'study-wait.png'), fullPage: true });

    // On the evening: the room opens through /go, and the click is recorded.
    clock = vn('2026-11-16T20:05:00');
    // The room opens: the ring becomes the way in, and the page goes on by itself.
    const autoRoom = page.waitForRequest(/127\.0\.0\.1:9\/room/);
    await page.reload();
    await page.waitForSelector('#go.live');
    assert.match(await page.textContent('#heading'), /Bấm vào đây để vào phòng/);
    assert.match(await page.textContent('#kicker'), /Buổi 1 đang mở/);
    if (shots) await page.screenshot({ path: path.join(shots, 'study-open.png'), fullPage: true });
    await autoRoom;
    assert.equal(repository.joins.get('e1:1').clicks, 1);
    const go = await page.request.get(`${base}/w/dong-tien/go/${key}`, { maxRedirects: 0 });
    assert.equal(go.status(), 302);
    assert.equal(go.headers().location, 'http://127.0.0.1:9/room');
    assert.equal(repository.joins.get('e1:1').clicks, 2);

    // /w/dong-tien goes to the week's link; a registered email goes straight into the open session.
    const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await fresh.route('**/*', blockOutside);
    const visitor = await fresh.newPage();
    visitor.on('pageerror', error => errors.push(error.message));
    await visitor.goto(`${base}/w/dong-tien?utm_source=zalo`);
    await visitor.waitForURL(/\/w\/dong-tien\/20h-16-11-26\?utm_source=zalo$/);
    if (shots) await visitor.screenshot({ path: path.join(shots, 'join-email.png'), fullPage: true });
    await visitor.waitForSelector('#join-form:not([hidden])');
    await visitor.fill('#name', 'Nguyễn Văn Test');
    await visitor.fill('#email', 'test@example.invalid');
    await visitor.fill('#phone', '0901234567');
    const intoRoom = visitor.waitForRequest(/127\.0\.0\.1:9\/room/);
    await visitor.click('#join-form button');
    await intoRoom;
    assert.equal(repository.joins.get('e1:1').clicks, 3);
    // Next visit on the same browser: no email, straight into the room.
    const again2 = await fresh.newPage();
    const straight = again2.waitForRequest(/127\.0\.0\.1:9\/room/);
    await again2.goto(`${base}/w/dong-tien/20h-16-11-26`).catch(() => {});
    await straight;
    assert.equal(repository.joins.get('e1:1').clicks, 4);

    // Waiting from before 20:00: at the start the page moves into the room by itself.
    clock = vn('2026-11-16T19:59:50');
    const waiting = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await waiting.clock.install({ time: vn('2026-11-16T19:59:50') });
    await waiting.route('**/*', blockOutside);
    const sitter = await waiting.newPage();
    sitter.on('pageerror', error => errors.push(error.message));
    await sitter.goto(`${base}/w/dong-tien/vao/${key}`);
    await sitter.waitForSelector('#countdown:not([hidden])');
    assert.match(await sitter.textContent('#cd-s'), /^(0\d|10)$/, 'seconds left before 20:00');
    assert.ok(await sitter.isHidden('#go.live'), 'not open yet');
    const byItself = sitter.waitForRequest(/127\.0\.0\.1:9\/room/);
    clock = vn('2026-11-16T20:00:05');
    await waiting.clock.runFor(15000);
    await byItself;
    await waiting.close();
    clock = vn('2026-11-16T20:05:00');

    // A new email on Wednesday evening: the link is this week's, so after the form they are in tonight.
    clock = vn('2026-11-18T20:10:00');
    const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await other.route('**/*', blockOutside);
    const newcomer = await other.newPage();
    newcomer.on('pageerror', error => errors.push(error.message));
    await newcomer.goto(`${base}/w/dong-tien`);
    await newcomer.waitForURL(/20h-18-11-26$/);
    assert.ok(await newcomer.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await newcomer.waitForSelector('#join-form:not([hidden])');
    if (shots) await newcomer.screenshot({ path: path.join(shots, 'quick-join.png'), fullPage: true });
    await newcomer.fill('#name', 'Người Mới');
    await newcomer.fill('#email', 'moi@example.invalid');
    await newcomer.fill('#phone', '0912345678');
    const newcomerRoom = newcomer.waitForRequest(/127\.0\.0\.1:9\/room/);
    await newcomer.click('#join-form button');
    await newcomerRoom;
    assert.equal(leads.length, 2);
    assert.equal(repository.enrollments[1].starts_on, '2026-11-16');
    assert.equal(repository.enrollments.length, 2, 'no extra week for the newcomer');
    // Visits are sent in the background (keepalive); give the last one a moment to arrive.
    let monday, wednesday;
    for (let i = 0; i < 30; i++) {
      const links = (await s.overview()).cohorts.find(c => c.starts_on === '2026-11-16').links;
      monday = links.find(l => l.slug === '20h-16-11-26');
      wednesday = links.find(l => l.slug === '20h-18-11-26');
      if (monday.visits >= 2 && wednesday.visits >= 1) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(monday.visits >= 2 && monday.visitors >= 1, JSON.stringify(monday));
    assert.equal(monday.registered, 0);
    assert.equal(monday.entered, 1);
    assert.equal(wednesday.position, 3);
    assert.ok(wednesday.visitors >= 1, JSON.stringify(wednesday));
    assert.equal(wednesday.registered, 1);
    assert.equal(wednesday.entered, 1);
    // A link of a week that is over goes to the current week.
    const oldWeek = await newcomer.request.get(`${base}/w/dong-tien/20h-09-11-26`, { maxRedirects: 0 });
    assert.equal(oldWeek.headers().location, '/w/dong-tien');
    assert.equal((await newcomer.request.get(`${base}/w/dong-tien`, { maxRedirects: 0 })).headers().location, '/w/dong-tien/20h-18-11-26');
    // An earlier session's link of this week still opens tonight's session.
    assert.equal((await newcomer.request.get(`${base}/w/dong-tien/20h-16-11-26`, { maxRedirects: 0 })).status(), 200);
    // Friday: the study week is over, the link is next week's.
    clock = vn('2026-11-20T10:00:00');
    assert.equal((await newcomer.request.get(`${base}/w/dong-tien`, { maxRedirects: 0 })).headers().location, '/w/dong-tien/20h-23-11-26');
    // Before the session: the waiting room, a countdown to 20:00 and the cohort's Zalo button.
    await s.saveCohort('2026-11-23', { zalo_name: 'K4', zalo_url: 'https://zalo.me/g/demo-k4' });
    const friday = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await friday.clock.setFixedTime(vn('2026-11-20T10:00:00'));
    await friday.route('**/*', blockOutside);
    const early = await friday.newPage();
    early.on('pageerror', error => errors.push(error.message));
    await early.goto(`${base}/w/dong-tien/20h-23-11-26`);
    await early.waitForSelector('#join-form:not([hidden])');
    await early.fill('#name', 'Người Đến Sớm');
    await early.fill('#email', 'som@example.invalid');
    await early.fill('#phone', '0933333333');
    await early.click('#join-form button');
    // The waiting room opens on the week link itself; the address stays the same.
    await early.waitForSelector('#countdown:not([hidden])');
    assert.ok(early.url().endsWith('/w/dong-tien/20h-23-11-26'), early.url());
    assert.ok(await early.isHidden('#join-view'));
    assert.match(await early.textContent('#heading'), /20:00 Thứ 2, 23\/11/);
    assert.match(await early.textContent('#message'), /đúng 20:00 hệ thống tự đưa bạn vào phòng/);
    assert.match(await early.textContent('#topic'), /gia sản triệu đô/);
    assert.ok(!/\bK\d+\b|Khóa \d/.test(await early.textContent('body')), 'no cohort name in the waiting room');
    assert.equal(await early.textContent('#cd-d'), '3', '3 days 10 hours to 20:00 Monday');
    assert.equal(await early.textContent('#cd-h'), '10');
    assert.ok((await early.getAttribute('#zalo', 'href')).startsWith('/w/dong-tien/zalo/'));
    assert.match(await early.getAttribute('#calendar', 'href'), /calendar\.google\.com.*20261123T130000Z/);
    if (shots) await early.screenshot({ path: path.join(shots, 'waiting-room.png') });
    // Same browser again on the link: no form, straight back to the waiting room.
    await early.goto(`${base}/w/dong-tien/20h-23-11-26`);
    await early.waitForSelector('#countdown:not([hidden])');
    assert.ok(early.url().endsWith('/w/dong-tien/20h-23-11-26'), early.url());
    assert.ok(await early.isHidden('#join-form'), 'no form the second time');
    assert.equal(leads.filter(l => l.email === 'som@example.invalid').length, 1);
    const mobileRoom = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await mobileRoom.goto(`${base}/w/dong-tien/vao/${repository.enrollments.find(e => e.email === 'som@example.invalid').access_key}`);
    // Phone: video on top, the countdown in the timer row, the Zalo button pinned at the bottom.
    await mobileRoom.waitForFunction(() => /\d{2}:\d{2}:\d{2}/.test(document.querySelector('#side-timer').textContent));
    assert.ok(await mobileRoom.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await mobileRoom.evaluate(() => document.querySelector('#zalo').getBoundingClientRect().bottom <= innerHeight + 1), 'Zalo button visible without scrolling');
    assert.ok(await mobileRoom.evaluate(() => document.querySelector('.room-stage').getBoundingClientRect().top === 0), 'video at the top');
    if (shots) await mobileRoom.screenshot({ path: path.join(shots, 'waiting-room-mobile.png') });
    // The same email registers again on Friday for the next week: a new seat, said on the page, and webinar_enrolled.
    const returning = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await returning.context().route('**/*', blockOutside);
    await returning.goto(`${base}/webinar-dong-tien`);
    await returning.fill('#name', 'Nguyễn Văn Test');
    await returning.fill('#phone', '0901234567');
    await returning.fill('#email', 'test@example.invalid');
    await returning.click('#registration-form button[type="submit"]');
    await returning.waitForURL(/thank-you$/);
    await returning.waitForSelector('#ready:not([hidden])');
    assert.match(await returning.textContent('#repeat'), /đợt mới/);
    assert.match(await returning.textContent('#first-at'), /23\/11/);
    const enrolledHook = sent.filter(([kind, p]) => kind === 'webhook' && p.event === 'webinar_enrolled').map(([, p]) => p).find(p => p.webinar_starts_on === '2026-11-23' && p.email === 'test@example.invalid');
    assert.ok(enrolledHook, 'webinar_enrolled for the new week');
    assert.equal(enrolledHook.page_id, 'webinar-4day');
    assert.equal(enrolledHook.webinar_source, 'landing');

    // After the cohort ended: invited to the newest one.
    clock = vn('2026-11-21T09:00:00');
    await page.goto(`${base}/w/dong-tien/vao/${key}`);
    await page.waitForSelector('#rejoin:not([hidden])');
    assert.match(await page.textContent('#heading'), /Đợt học của bạn đã kết thúc/);
    await page.click('#rejoin');
    await page.waitForFunction(() => document.querySelector('#heading').textContent.includes('23/11'));
    assert.equal(repository.enrollments.at(-1).starts_on, '2026-11-23');

    const wrong = await page.request.get(`${base}/w/dong-tien/go/khong-co`, { maxRedirects: 0 });
    assert.equal(wrong.status(), 404);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
}

// The real EverWebinar calls: schedule read from the webinar, this session's date, no phone sent.
async function everwebinarCalls() {
  const { registerSessionRoom } = require('../src/webinarService');
  const realFetch = global.fetch, calls = [];
  global.fetch = async (url, options) => {
    const body = Object.fromEntries(new URLSearchParams(options.body.toString()));
    calls.push({ url, body });
    const json = url.endsWith('/webinar')
      ? { status: 'success', webinar: { schedules: [{ date: '2026-11-23 20:00', schedule: 9 }, { date: '2026-11-16 20:00', schedule: 7 }] } }
      : { status: 'success', user: { live_room_url: 'https://room.example.test/personal', schedule: Number(body.schedule) } };
    return new Response(JSON.stringify(json), { status: 200 });
  };
  try {
    const room = await registerSessionRoom({ apiKey: 'k', webinarId: '162', at: '2026-11-16 20:00', lead: { name: 'Nguyễn Văn An', email: 'an@example.invalid', ip: '1.2.3.4' } });
    assert.equal(room, 'https://room.example.test/personal');
    const register = calls.find(c => c.url.endsWith('/register'));
    assert.equal(register.body.schedule, '7');
    assert.equal(register.body.date, '2026-11-16 20:00');
    assert.equal(register.body.timezone, 'GMT+7');
    assert.equal(register.body.email, 'an@example.invalid');
    assert.equal(register.body.phone, undefined);
    await registerSessionRoom({ apiKey: 'k', webinarId: '162', at: '2026-11-23 20:00', lead: { name: 'B', email: 'b@example.invalid' } });
    assert.equal(calls.filter(c => c.url.endsWith('/webinar')).length, 1, 'schedules are cached');
  } finally { global.fetch = realFetch; }
}

// Who watched: EverWebinar's registrants list read page by page, then matched to the cohort.
async function attendance() {
  const { webinarRegistrants, everwebinarMoment } = require('../src/webinarService');
  assert.equal(everwebinarMoment('Mon, 16 Nov 2026, 08:00 PM'), '2026-11-16 20:00');
  assert.equal(everwebinarMoment('Wed, 11 Nov 2026, 09:42 AM'), '2026-11-11 09:42');
  assert.equal(everwebinarMoment('Thu, 5 Mar 2026, 12:05 AM'), '2026-03-05 00:05');
  assert.equal(everwebinarMoment('Thu, 5 Mar 2026, 12:30 PM'), '2026-03-05 12:30');
  assert.equal(everwebinarMoment('Direct link'), '');
  const realFetch = global.fetch, pages = [];
  global.fetch = async (url, options) => {
    const body = Object.fromEntries(new URLSearchParams(options.body.toString()));
    pages.push(body.page);
    const row = { email: ` An@Example.invalid `, event: 'Mon, 16 Nov 2026, 08:00 PM', schedule: 'Mon, 16 Nov 2026, 08:00 PM', attended_live: body.page === '1' ? 'Yes' : 'No', time_live: '01:02:03', attended_replay: 'No', time_replay: '00:00:00' };
    return new Response(JSON.stringify({ status: 'success', registrants: { current_page: Number(body.page), last_page: 2, data: [row] } }), { status: 200 });
  };
  try {
    const rows = await webinarRegistrants({ apiKey: 'k', webinarId: '171' });
    assert.deepEqual(pages, ['1', '2']);
    assert.deepEqual(rows[0], { email: 'an@example.invalid', event_at: '2026-11-16 20:00', schedule: 'Mon, 16 Nov 2026, 08:00 PM', attended_live: true, live_seconds: 3723, attended_replay: false, replay_seconds: 0 });
    assert.equal(rows[1].attended_live, false);
  } finally { global.fetch = realFetch; }

  let clock = vn('2026-11-16T22:00:00');
  const repository = memoryRepository(() => clock);
  const store = {};
  const crm = { getCrmSetting: async (key, fallback) => store[key] ?? fallback, setCrmSetting: async (key, value) => { store[key] = value; }, getRegistrationById: async () => null };
  const calls = [];
  let list = [
    { email: 'a@example.invalid', event_at: '2026-11-16 20:00', attended_live: true, live_seconds: 2700, attended_replay: false, replay_seconds: 0 },
    // The same person again through the direct link that day: counted once, the longer time kept.
    { email: 'a@example.invalid', event_at: '2026-11-16 20:05', attended_live: true, live_seconds: 600, attended_replay: true, replay_seconds: 300 },
    { email: 'b@example.invalid', event_at: '2026-11-16 20:00', attended_live: false, live_seconds: 0, attended_replay: false, replay_seconds: 0 },
    { email: 'stranger@example.invalid', event_at: '2026-11-16 20:00', attended_live: true, live_seconds: 900, attended_replay: false, replay_seconds: 0 },
    { email: 'c@example.invalid', event_at: '2026-11-09 20:00', attended_live: true, live_seconds: 900, attended_replay: false, replay_seconds: 0 },
  ];
  const everwebinar = { webinarRegistrants: async args => { calls.push(args.webinarId); if (list === null) throw new Error('EverWebinar registrants HTTP 500'); return list; } };
  const s = createWebinarProgramService({ repository, crm, everwebinar, now: () => clock });
  const defaults = normalizeSettings();
  assert.deepEqual(await s.syncDue(), [], 'no key, no pull');
  await assert.rejects(s.syncAttendance('2026-11-16'), /API key/);
  await s.saveSettings({ api_key: 'k', sessions: defaults.sessions.map((x, i) => ({ ...x, webinar_id: i === 1 ? '' : String(171 + i) })) });
  for (const [i, email] of ['a', 'b', 'c'].entries()) await repository.insert({ starts_on: '2026-11-16', registration_id: `r${i}`, email: `${email}@example.invalid`, access_key: `k${i}`, source: i === 1 ? 'link' : 'landing' });

  // Two hours after session 1: only session 1 is pulled.
  let done = await s.syncDue();
  assert.deepEqual(calls, ['171']);
  assert.deepEqual(done, [{ starts_on: '2026-11-16', sessions: [{ position: 1, matched: 2, attended: 1 }] }]);
  const a = repository.joins.get('e1:1');
  assert.equal(a.attended_live, true);
  assert.equal(a.live_seconds, 2700);
  assert.equal(a.attended_replay, true);
  assert.equal(a.clicks, 0, 'watching without our link still counts');
  assert.equal(repository.joins.get('e2:1').attended_live, false);
  assert.equal(repository.joins.has('e3:1'), false, 'another week of the same webinar is not this session');

  // Within the hour nothing is pulled again; after it, session 1 again.
  clock = vn('2026-11-16T22:30:00');
  assert.deepEqual(await s.syncDue(), []);
  clock = vn('2026-11-16T23:05:00');
  assert.equal((await s.syncDue()).length, 1);
  assert.equal(calls.length, 2);

  const cohort = (await s.overview()).cohorts.find(c => c.starts_on === '2026-11-16');
  assert.equal(cohort.attendance[0].live, 1);
  assert.equal(cohort.attendance[0].avg_live_minutes, 45);
  assert.equal(cohort.attendance[1].synced_at, null);
  assert.deepEqual(cohort.flows.landing.session_live, [1, 0, 0, 0]);
  assert.deepEqual(cohort.flows.link.session_live, [0, 0, 0, 0]);
  assert.deepEqual(cohort.session_joins, [0, 0, 0, 0], 'clicks stay apart from watching');
  const person = (await s.people('2026-11-16')).people.find(p => p.email === 'a@example.invalid');
  assert.deepEqual(person.joins, []);
  assert.deepEqual(person.attendance, [{ position: 1, live: true, live_minutes: 45, replay: true, replay_minutes: 5 }]);

  // The button the day after: every session that started; one without a Webinar ID says so,
  // and a failing EverWebinar keeps the last numbers.
  clock = vn('2026-11-17T22:00:00');
  list = null;
  const manual = await s.syncAttendance('2026-11-16');
  assert.deepEqual(manual.sessions.map(r => [r.position, r.error]), [[1, 'EverWebinar registrants HTTP 500'], [2, 'Buổi này chưa có Webinar ID.']]);
  assert.equal(repository.syncRows.get('2026-11-16:1').matched, 2);
  assert.equal(repository.syncRows.get('2026-11-16:1').error, 'EverWebinar registrants HTTP 500');
  // Three days on, last week's sessions are no longer pulled.
  clock = vn('2026-11-23T10:00:00');
  list = [];
  calls.length = 0;
  await s.syncDue();
  assert.deepEqual(calls, []);
}

// Each session's weekday and hour come from its webinar's schedule on EverWebinar.
async function scheduleFromEverWebinar() {
  const store = {};
  const crm = { getCrmSetting: async (key, fallback) => store[key] ?? fallback, setCrmSetting: async (key, value) => { store[key] = value; } };
  const dates = { 171: '2026-11-16 20:00', 172: '2026-11-17 19:30', 173: '2026-11-11 17:45', 174: '' };
  const asked = [];
  const everwebinar = { webinarSchedules: async (apiKey, id, options) => { asked.push([id, options.fresh]); if (id === '174') throw new Error('EverWebinar details HTTP 404'); return [{ schedule: 1, date: dates[id] }]; } };
  const clock = vn('2026-11-11T17:00:00');
  const s = createWebinarProgramService({ repository: memoryRepository(() => clock), crm, everwebinar, now: () => clock });
  const defaults = normalizeSettings();
  assert.deepEqual(await s.syncSchedule(), { changed: false, sessions: [] }, 'no key, nothing asked');
  const saved = await s.saveSettings({ api_key: 'k', sessions: defaults.sessions.map((x, i) => ({ ...x, webinar_id: String(171 + i) })) });
  assert.ok(asked.every(([, fresh]) => fresh), 'saving reads EverWebinar fresh');
  assert.equal(saved.schedule.changed, true);
  assert.equal(saved.schedule.sessions.find(r => r.webinar_id === '174').error, 'EverWebinar details HTTP 404');
  // 172 keeps Tuesday at 19:30; 173 is a one-off on Wednesday at 17:45; 174 keeps what it had.
  assert.deepEqual(store[SETTINGS_KEY].sessions.map(x => [x.weekday, x.time]), [[1, '20:00'], [2, '19:30'], [3, '17:45'], [4, '20:00']]);
  const cohort = (await s.overview()).cohorts.find(c => c.starts_on === '2026-11-16');
  assert.equal(cohort.sessions[1].at, vn('2026-11-17T19:30:00').toISOString());
  assert.deepEqual(cohort.links.map(l => l.slug), ['20h-16-11-26', '19h30-17-11-26', '17h45-18-11-26', '20h-19-11-26']);
  // Nothing new: nothing written. Two webinars on one weekday: the old schedule stays.
  assert.equal((await s.syncSchedule()).changed, false);
  dates[173] = '2026-11-17 21:00';
  const clash = await s.syncSchedule();
  assert.match(clash.error, /Mỗi buổi học phải vào một thứ khác nhau/);
  assert.equal(store[SETTINGS_KEY].sessions[2].time, '17:45');
}

// Without Postgres in development the cohort data goes to a file; in production the error stays.
async function developmentFile() {
  const file = path.join(require('node:os').tmpdir(), `webinar-program-test-${process.pid}.json`);
  const down = Object.assign(new Error('refused'), { code: 'ECONNREFUSED' });
  const primary = createRepository({ query: async () => { throw down; } });
  try {
    const clock = () => vn('2026-11-12T10:00:00');
    const crm = { getCrmSetting: storage.getCrmSetting, setCrmSetting: storage.setCrmSetting };
    const local = createWebinarProgramService({ repository: withDevelopmentFile(primary, file, true), crm, now: clock });
    await local.saveCohort('2026-11-16', { zalo_name: 'Nhóm', zalo_url: 'https://zalo.me/g/x' });
    const view = await local.enroll({ id: 'r1', email: 'an@example.invalid' });
    assert.equal(view.starts_on, '2026-11-16');
    assert.equal(view.zalo.available, true);
    assert.equal((await local.check({ email: 'an@example.invalid' })).key, view.key);
    assert.equal(await local.zalo(view.key), 'https://zalo.me/g/x');
    assert.equal((await local.overview()).cohorts.find(c => c.starts_on === '2026-11-16').zalo_clicks, 1);
    const live = createWebinarProgramService({ repository: withDevelopmentFile(primary, file, false), crm, now: clock });
    await assert.rejects(live.check({ email: 'an@example.invalid' }), /refused/);
  } finally { require('node:fs').rmSync(file, { force: true }); }
}

(async () => {
  rules();
  await developmentFile();
  await everwebinarCalls();
  await attendance();
  await scheduleFromEverWebinar();
  console.log('PASS: session times read from EverWebinar');
  console.log('PASS: attendance pull from EverWebinar (paging, matching by day, schedule, errors)');
  await service();
  console.log('PASS: cohort rules, settings, masked key, personal rooms, direct-link fallback, ended cohorts');
  await browserFlow();
  console.log('PASS: landing → thank-you, webhook fields, Zalo redirect, repeat email, study page, /w/dong-tien');
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
