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

function memoryRepository() {
  const groups = new Map(), enrollments = [], joins = new Map(), links = new Map();
  return {
    enrollments, joins,
    groups: async dates => dates.filter(d => groups.has(d)).map(d => ({ starts_on: d, ...groups.get(d) })),
    group: async d => groups.get(d) || null,
    saveGroup: async (d, zalo_name, zalo_url) => { groups.set(d, { zalo_name, zalo_url }); },
    counts: async dates => dates.map(d => ({ starts_on: d, people: enrollments.filter(e => e.starts_on === d).length, zalo_clicks: enrollments.filter(e => e.starts_on === d && e.zalo_clicked_at).length })),
    joinCounts: async () => [...joins.values()].map(j => ({ starts_on: enrollments.find(e => e.id === j.id).starts_on, position: j.position, people: 1 })),
    latest: async email => enrollments.filter(e => e.email === email).sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0] || null,
    byKey: async key => enrollments.find(e => e.access_key === key) || null,
    insert: async row => { if (!enrollments.some(e => e.email === row.email && e.starts_on === row.starts_on)) enrollments.push({ id: `e${enrollments.length + 1}`, ...row }); },
    markZalo: async id => { enrollments.find(e => e.id === id).zalo_clicked_at = 'now'; },
    people: async d => enrollments.filter(e => e.starts_on === d).map(e => ({ ...e, joins: [...joins.values()].filter(j => j.id === e.id) })),
    links, linkEvent: async (slug, starts_on, kind, visitor) => { const key = `${slug}:${kind}:${visitor}`; links.set(key, { slug, starts_on, kind, hits: (links.get(key)?.hits || 0) + 1 }); },
    linkStats: async () => { const out = new Map(); for (const r of links.values()) { const k = `${r.slug}:${r.kind}`; const t = out.get(k) || { starts_on: r.starts_on, slug: r.slug, kind: r.kind, people: 0, hits: 0 }; t.people++; t.hits += r.hits; out.set(k, t); } return [...out.values()]; },
    room: async (id, position) => joins.get(`${id}:${position}`)?.room_url || '',
    recordJoin: async (id, position, room_url) => { const old = joins.get(`${id}:${position}`); joins.set(`${id}:${position}`, { id, position, room_url: room_url || old?.room_url || '', clicks: (old?.clicks || 0) + 1 }); },
  };
}

async function service() {
  let clock = vn('2026-11-12T10:00:00');
  const repository = memoryRepository();
  const rooms = [];
  let down = false;
  const everwebinar = { registerSessionRoom: async args => { rooms.push(args); if (down) throw new Error('down'); return `https://room.example.test/${args.webinarId}/${args.lead.email}`; } };
  const crm = { getCrmSetting: storage.getCrmSetting, setCrmSetting: storage.setCrmSetting, getRegistrationById: async () => ({ name: 'Nguyễn Văn A' }) };
  const s = createWebinarProgramService({ repository, crm, everwebinar, now: () => clock });
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
  clock = vn('2026-11-16T15:00:00');
  assert.equal(await s.currentLink(), '/w/dong-tien/20h-23-11-26');
  assert.equal(await s.linkOpen('20h-16-11-26'), true, 'the running week keeps its link');
  assert.equal(await s.linkOpen('20h-23-11-26'), true);
  assert.equal(await s.linkOpen('20h-30-11-26'), false, 'a later week is not open yet');
  assert.equal(await s.linkOpen('20h-17-11-26'), false, 'not a Monday');
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

  // During the study week: the enrolled person keeps their cohort, a new one waits for next Monday.
  clock = vn('2026-11-18T19:45:00');
  assert.equal((await s.enroll({ id: 'r1', email: 'an@example.invalid' })).key, first.key);
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
  assert.equal(view.cohorts[0].links[0].entered, 1);
  assert.ok(!JSON.stringify(view).includes('secret-key'));
  assert.equal(view.cohorts[0].starts_on, '2026-11-16', 'nothing before the first cohort');
  const k3 = view.cohorts[0], k4 = view.cohorts[1];
  assert.equal(k3.people, 1);
  assert.equal(k3.zalo_clicks, 1);
  assert.deepEqual(k3.session_joins, [0, 0, 1, 1]);
  assert.equal(k4.people, 2);
  assert.equal(k4.zalo_name_suggested, 'PHƯƠNG PHÁP XÂY DỰNG DÒNG TIỀN K4');
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
    assert.match(await page.textContent('h1'), /Phương pháp xây dựng\s*Dòng Tiền/);
    await page.waitForFunction(() => document.querySelector('#schedule-summary').textContent.includes('4 buổi'));
    assert.match(await page.textContent('#schedule-summary'), /Từ 20:00 các ngày 16, 17, 18, 19\/11/);
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
    assert.equal(await page.textContent('#label'), 'K3');
    assert.match(await page.textContent('#first-at'), /20:00 Thứ 2, 16\/11/);
    const key = repository.enrollments[0].access_key;
    assert.equal(await page.getAttribute('#zalo', 'href'), `/w/dong-tien/zalo/${key}`);
    assert.equal(await page.getAttribute('#join', 'href'), `/w/dong-tien/vao/${key}`);
    assert.equal(await page.locator('#schedule li').count(), 4);
    assert.match(await page.textContent('#schedule'), /Buổi 4: 20:00 Thứ 5, 19\/11/);
    if (shots) await page.screenshot({ path: path.join(shots, 'thank-you.png'), fullPage: true });
    const hook = sent.find(([kind]) => kind === 'webhook')[1];
    assert.equal(hook.webinar_cohort, 'K3');
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

    // Before the evening: the study page says when, no button into the room.
    await page.goto(`${base}/w/dong-tien/vao/${key}`);
    await page.waitForFunction(() => document.querySelector('#heading').textContent.includes('Buổi tiếp theo'));
    assert.match(await page.textContent('#heading'), /20:00 Thứ 2, 16\/11/);
    assert.ok(await page.isHidden('#go'));
    if (shots) await page.screenshot({ path: path.join(shots, 'study-wait.png'), fullPage: true });

    // On the evening: the room opens through /go, and the click is recorded.
    clock = vn('2026-11-16T19:50:00');
    await page.reload();
    await page.waitForSelector('#go:not([hidden])');
    assert.match(await page.textContent('#heading'), /Buổi 1 đang mở/);
    if (shots) await page.screenshot({ path: path.join(shots, 'study-open.png'), fullPage: true });
    const go = await page.request.get(`${base}/w/dong-tien/go/${key}`, { maxRedirects: 0 });
    assert.equal(go.status(), 302);
    assert.equal(go.headers().location, 'http://127.0.0.1:9/room');
    assert.equal(repository.joins.get('e1:1').clicks, 1);

    // /w/dong-tien goes to the week's link; a registered email goes straight into the open session.
    const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await fresh.route('**/*', blockOutside);
    const visitor = await fresh.newPage();
    visitor.on('pageerror', error => errors.push(error.message));
    await visitor.goto(`${base}/w/dong-tien?utm_source=zalo`);
    await visitor.waitForURL(/\/w\/dong-tien\/20h-23-11-26\?utm_source=zalo$/);
    if (shots) await visitor.screenshot({ path: path.join(shots, 'join-email.png'), fullPage: true });
    await visitor.fill('#email', 'test@example.invalid');
    const intoRoom = visitor.waitForRequest(/127\.0\.0\.1:9\/room/);
    await visitor.click('#email-form button');
    await intoRoom;
    assert.equal(repository.joins.get('e1:1').clicks, 2);
    // Next visit on the same browser: no email, straight into the room.
    const again2 = await fresh.newPage();
    const straight = again2.waitForRequest(/127\.0\.0\.1:9\/room/);
    await again2.goto(`${base}/w/dong-tien/20h-23-11-26`).catch(() => {});
    await straight;
    assert.equal(repository.joins.get('e1:1').clicks, 3);

    // A new email in the study week: the rule gives next Monday, so the form leads to that schedule.
    clock = vn('2026-11-18T20:10:00');
    const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await other.route('**/*', blockOutside);
    const newcomer = await other.newPage();
    newcomer.on('pageerror', error => errors.push(error.message));
    await newcomer.goto(`${base}/w/dong-tien`);
    await newcomer.waitForURL(/20h-23-11-26$/);
    await newcomer.fill('#email', 'moi@example.invalid');
    await newcomer.click('#email-form button');
    await newcomer.waitForSelector('#registration-form:not([hidden])');
    await newcomer.fill('#name', 'Người Mới');
    await newcomer.fill('#phone', '0912345678');
    await newcomer.click('#registration-form button');
    await newcomer.waitForURL(/\/w\/dong-tien\/vao\//);
    await newcomer.waitForFunction(() => document.querySelector('#heading').textContent.includes('Buổi tiếp theo'));
    assert.match(await newcomer.textContent('#heading'), /20:00 Thứ 2, 23\/11/);
    assert.ok(await newcomer.isHidden('#go'), 'not into tonight\'s session');
    assert.equal(leads.length, 2);
    assert.equal(repository.enrollments[1].starts_on, '2026-11-23');
    assert.ok(await newcomer.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const stats = (await s.overview()).cohorts.find(c => c.starts_on === '2026-11-23').links[0];
    assert.equal(stats.slug, '20h-23-11-26');
    assert.ok(stats.visits >= 3 && stats.visitors >= 2, JSON.stringify(stats));
    assert.equal(stats.registered, 1);
    assert.equal(stats.entered, 1);
    // A link of a week that is over goes to the current week.
    await newcomer.goto(`${base}/w/dong-tien/20h-09-11-26`);
    await newcomer.waitForURL(/20h-23-11-26$/);

    // After the cohort ended: invited to the newest one.
    clock = vn('2026-11-21T09:00:00');
    await page.goto(`${base}/w/dong-tien/vao/${key}`);
    await page.waitForSelector('#rejoin:not([hidden])');
    assert.match(await page.textContent('#heading'), /K3 đã kết thúc/);
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
  await service();
  console.log('PASS: cohort rules, settings, masked key, personal rooms, direct-link fallback, ended cohorts');
  await browserFlow();
  console.log('PASS: landing → thank-you, webhook fields, Zalo redirect, repeat email, study page, /w/dong-tien');
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
