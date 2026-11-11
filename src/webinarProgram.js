// Weekly webinar funnel (Dòng Tiền on EverWebinar). Everyone registered between one Monday's
// cutoff and the next (Vietnam time, whichever link they used) is one cohort, which studies on
// the evenings of the week starting at that second Monday. Each person's cohort is fixed when
// they register; nothing has to be opened by hand each week; admins set each cohort's Zalo group.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MINUTE = 60000, HOUR = 60 * MINUTE, DAY = 24 * HOUR, WEEK = 7 * DAY, VN = 7 * HOUR;
const PROGRAM = 'webinar-dong-tien';
const SETTINGS_KEY = 'webinar_program_dong_tien';
const MASK = '********';
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]; // 1 = Monday
// A session's room can be entered from 30 minutes before it until 3 hours after its start.
const OPENS_BEFORE = 30 * MINUTE, CLOSES_AFTER = 3 * HOUR;
const EVERWEBINAR_TIMEOUT = 8000;
const BASE_PATH = '/w/dong-tien';
const DEFAULTS = {
  title: 'Phương pháp xây dựng Dòng Tiền',
  cutoff_time: '15:00',
  first_number: null, // K number of the first cohort; until set, cohorts go by their date
  first_starts_on: '',
  zalo_name_template: 'PHƯƠNG PHÁP XÂY DỰNG DÒNG TIỀN K{k}',
  api_key: '',
  sessions: [1, 2, 3, 4].map(weekday => ({ weekday, time: '20:00', enabled: true, webinar_id: '', direct_url: '' })),
};

const fail = (message, status = 400, code) => Object.assign(new Error(message), { status, code });
const clean = value => String(value ?? '').trim();
const emailKey = value => clean(value).toLowerCase();
const isTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const dayMs = date => Date.parse(`${date}T00:00:00Z`);
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const addDays = (date, days) => isoDay(dayMs(date) + days * DAY);
const isMonday = date => new Date(dayMs(date)).getUTCDay() === 1;
const instant = (date, time) => new Date(`${date}T${time}:00+07:00`).toISOString();
const vnStamp = iso => new Date(new Date(iso).getTime() + VN).toISOString().slice(0, 16).replace('T', ' ');

// The Monday whose cutoff ends the registration window this moment falls in.
function startsOnFor(at, cutoffTime = DEFAULTS.cutoff_time) {
  const local = new Date(at).getTime() + VN;
  const today = Math.floor(local / DAY) * DAY;
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
  return isoDay(local >= monday + minutes(cutoffTime) * MINUTE ? monday + WEEK : monday);
}

// The week's link ends with its first evening: 20h-16-11-26 (20h30-16-11-26 at 20:30).
function weekSlug(cohort) {
  const [day, time] = vnStamp(cohort.sessions[0]?.at || cohort.closes_at).split(' ');
  const [hour, minute] = time.split(':');
  return `${Number(hour)}h${minute === '00' ? '' : minute}-${day.slice(8)}-${day.slice(5, 7)}-${day.slice(2, 4)}`;
}
// The Monday a week link belongs to, or '' for anything else.
function startsOnOfSlug(slug) {
  const match = /^\d{1,2}h\d{0,2}-(\d{2})-(\d{2})-(\d{2})$/.exec(clean(slug));
  if (!match) return '';
  const date = `20${match[3]}-${match[2]}-${match[1]}`;
  return isDate(date) && isMonday(date) ? date : '';
}

// The Monday of the week a moment falls in (Vietnam time).
function mondayOf(at) {
  const local = new Date(at).getTime() + VN;
  const today = Math.floor(local / DAY) * DAY;
  return isoDay(today - ((new Date(today).getUTCDay() + 6) % 7) * DAY);
}

function numberOf(startsOn, settings) {
  if (!settings.first_starts_on || settings.first_number == null) return null;
  const weeks = Math.round((dayMs(startsOn) - dayMs(settings.first_starts_on)) / WEEK);
  return weeks < 0 ? null : settings.first_number + weeks;
}

// One cohort: its registration window, its evenings and where it stands at `now`.
function cohortOf(startsOn, settings, now = new Date()) {
  const closes = instant(startsOn, settings.cutoff_time);
  const opens = instant(addDays(startsOn, -7), settings.cutoff_time);
  const sessions = settings.sessions.filter(s => s.enabled).sort((a, b) => a.weekday - b.weekday)
    .map((s, i) => ({ position: i + 1, weekday: s.weekday, at: instant(addDays(startsOn, s.weekday - 1), s.time) }));
  const last = sessions.at(-1)?.at || closes;
  const time = new Date(now).getTime();
  const status = time < Date.parse(opens) ? 'upcoming' : time < Date.parse(closes) ? 'collecting'
    : time < Date.parse(last) + CLOSES_AFTER ? 'running' : 'done';
  const number = numberOf(startsOn, settings);
  return { starts_on: startsOn, number, label: number == null ? `Khóa ${startsOn.slice(8)}/${startsOn.slice(5, 7)}` : `K${number}`, opens_at: opens, closes_at: closes, sessions, status };
}

function normalizeSettings(raw = {}) {
  const sessions = Array.isArray(raw.sessions) && raw.sessions.length ? raw.sessions : DEFAULTS.sessions;
  const first = raw.first_number === '' || raw.first_number == null ? null : Number(raw.first_number);
  return {
    title: clean(raw.title).slice(0, 160) || DEFAULTS.title,
    cutoff_time: clean(raw.cutoff_time) || DEFAULTS.cutoff_time,
    first_number: first,
    first_starts_on: clean(raw.first_starts_on),
    zalo_name_template: clean(raw.zalo_name_template).slice(0, 160) || DEFAULTS.zalo_name_template,
    api_key: clean(raw.api_key),
    sessions: sessions.slice(0, 7).map(s => ({
      weekday: Number(s.weekday), time: clean(s.time) || '20:00', enabled: s.enabled !== false,
      webinar_id: clean(s.webinar_id).slice(0, 40), direct_url: clean(s.direct_url).slice(0, 500),
    })),
  };
}

function validate(settings) {
  if (!isTime(settings.cutoff_time)) throw fail('Mốc chốt danh sách phải có dạng giờ:phút, ví dụ 15:00.');
  if (settings.first_number != null && (!Number.isInteger(settings.first_number) || settings.first_number < 1)) throw fail('Số khóa đầu tiên phải là số nguyên từ 1 trở lên.');
  if (settings.first_starts_on && (!isDate(settings.first_starts_on) || !isMonday(settings.first_starts_on))) throw fail('Ngày bắt đầu khóa đầu tiên phải là một ngày thứ 2.');
  if ((settings.first_number == null) !== !settings.first_starts_on) throw fail('Nhập cả số khóa đầu tiên và ngày bắt đầu, hoặc để trống cả hai.');
  if (!settings.sessions.some(s => s.enabled)) throw fail('Cần bật ít nhất một buổi học.');
  const days = settings.sessions.filter(s => s.enabled).map(s => s.weekday);
  if (new Set(days).size !== days.length) throw fail('Mỗi buổi học phải vào một thứ khác nhau.');
  settings.sessions.forEach((s, i) => {
    if (!WEEKDAYS.includes(s.weekday)) throw fail(`Buổi ${i + 1}: thứ trong tuần không hợp lệ.`);
    if (!isTime(s.time)) throw fail(`Buổi ${i + 1}: giờ học phải có dạng giờ:phút, ví dụ 20:00.`);
    if (s.webinar_id && !/^\d+$/.test(s.webinar_id)) throw fail(`Buổi ${i + 1}: Webinar ID chỉ gồm chữ số.`);
    if (s.direct_url && !/^https:\/\/\S+$/.test(s.direct_url)) throw fail(`Buổi ${i + 1}: link vào thẳng phải bắt đầu bằng https://.`);
  });
}

const publicSettings = settings => ({ ...settings, api_key: settings.api_key ? MASK : '' });

// Postgres storage; the funnel test swaps in an in-memory one.
function createRepository(database) {
  const q = (sql, params) => database.query(sql, params).then(result => result.rows);
  const ENROLLMENT = `id, program, to_char(starts_on, 'YYYY-MM-DD') as starts_on, registration_id, email, access_key, zalo_clicked_at, created_at`;
  return {
    groups: dates => q(`select to_char(starts_on, 'YYYY-MM-DD') as starts_on, zalo_name, zalo_url from public.webinar_cohorts where program = $1 and starts_on = any($2::date[])`, [PROGRAM, dates]),
    group: startsOn => q(`select zalo_name, zalo_url from public.webinar_cohorts where program = $1 and starts_on = $2`, [PROGRAM, startsOn]).then(rows => rows[0] || null),
    saveGroup: (startsOn, name, url) => q(`insert into public.webinar_cohorts (program, starts_on, zalo_name, zalo_url, updated_at) values ($1, $2, $3, $4, now())
      on conflict (program, starts_on) do update set zalo_name = excluded.zalo_name, zalo_url = excluded.zalo_url, updated_at = now()`, [PROGRAM, startsOn, name, url]),
    counts: dates => q(`select to_char(starts_on, 'YYYY-MM-DD') as starts_on, count(*)::int as people, count(zalo_clicked_at)::int as zalo_clicks
        from public.webinar_enrollments where program = $1 and starts_on = any($2::date[]) group by starts_on`, [PROGRAM, dates]),
    joinCounts: dates => q(`select to_char(e.starts_on, 'YYYY-MM-DD') as starts_on, j.position, count(*)::int as people
        from public.webinar_session_joins j join public.webinar_enrollments e on e.id = j.enrollment_id
       where e.program = $1 and e.starts_on = any($2::date[]) and j.clicks > 0 group by e.starts_on, j.position`, [PROGRAM, dates]),
    latest: email => q(`select ${ENROLLMENT} from public.webinar_enrollments where program = $1 and email = $2 order by starts_on desc limit 1`, [PROGRAM, email]).then(rows => rows[0] || null),
    byKey: key => q(`select ${ENROLLMENT} from public.webinar_enrollments where access_key = $1`, [key]).then(rows => rows[0] || null),
    forWeek: (email, startsOn) => q(`select ${ENROLLMENT} from public.webinar_enrollments where program = $1 and email = $2 and starts_on = $3`, [PROGRAM, email, startsOn]).then(rows => rows[0] || null),
    // Two simultaneous sign-ups of one email end with the same enrollment.
    insert: row => q(`insert into public.webinar_enrollments (program, starts_on, registration_id, email, access_key) values ($1, $2, $3, $4, $5)
      on conflict (program, email, starts_on) do nothing`, [PROGRAM, row.starts_on, row.registration_id, row.email, row.access_key]),
    markZalo: id => q(`update public.webinar_enrollments set zalo_clicked_at = coalesce(zalo_clicked_at, now()) where id = $1`, [id]),
    people: startsOn => q(`select e.registration_id, e.email, e.created_at, e.zalo_clicked_at,
        coalesce(json_agg(json_build_object('position', j.position, 'clicks', j.clicks, 'first_at', j.first_at)) filter (where j.position is not null), '[]') as joins
        from public.webinar_enrollments e left join public.webinar_session_joins j on j.enrollment_id = e.id and j.clicks > 0
       where e.program = $1 and e.starts_on = $2 group by e.id order by e.created_at desc`, [PROGRAM, startsOn]),
    linkEvent: (slug, startsOn, kind, visitor) => q(`insert into public.webinar_link_events (program, slug, starts_on, kind, visitor) values ($1, $2, $3, $4, $5)
      on conflict (program, slug, kind, visitor) do update set hits = webinar_link_events.hits + 1, last_at = now()`, [PROGRAM, slug, startsOn, kind, visitor]),
    linkStats: dates => q(`select to_char(starts_on, 'YYYY-MM-DD') as starts_on, slug, kind, count(*)::int as people, sum(hits)::int as hits
        from public.webinar_link_events where program = $1 and starts_on = any($2::date[]) group by starts_on, slug, kind`, [PROGRAM, dates]),
    room: (id, position) => q(`select room_url from public.webinar_session_joins where enrollment_id = $1 and position = $2`, [id, position]).then(rows => rows[0]?.room_url || ''),
    recordJoin: (id, position, roomUrl) => q(`insert into public.webinar_session_joins (enrollment_id, position, room_url, clicks, first_at, last_at) values ($1, $2, $3, 1, now(), now())
      on conflict (enrollment_id, position) do update set room_url = case when excluded.room_url <> '' then excluded.room_url else webinar_session_joins.room_url end, clicks = webinar_session_joins.clicks + 1, last_at = now()`, [id, position, roomUrl]),
  };
}

// The same storage in a JSON file, for development without Postgres.
function createFileRepository(file) {
  const load = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { groups: {}, enrollments: [], joins: {} }; } };
  const change = fn => { const data = load(); const result = fn(data); fs.writeFileSync(file, JSON.stringify(data, null, 2)); return result; };
  const newest = rows => [...rows].sort((a, b) => b.starts_on.localeCompare(a.starts_on))[0] || null;
  return {
    groups: async dates => { const { groups } = load(); return dates.filter(d => groups[d]).map(d => ({ starts_on: d, ...groups[d] })); },
    group: async startsOn => load().groups[startsOn] || null,
    saveGroup: async (startsOn, zalo_name, zalo_url) => change(d => { d.groups[startsOn] = { zalo_name, zalo_url }; }),
    counts: async dates => { const { enrollments } = load(); return dates.map(date => { const own = enrollments.filter(e => e.starts_on === date); return { starts_on: date, people: own.length, zalo_clicks: own.filter(e => e.zalo_clicked_at).length }; }); },
    joinCounts: async dates => { const { enrollments, joins } = load(); return dates.flatMap(date => [...new Set(Object.values(joins).map(j => j.position))].map(position => ({ starts_on: date, position, people: Object.values(joins).filter(j => j.position === position && enrollments.find(e => e.id === j.enrollment_id)?.starts_on === date).length }))); },
    latest: async email => newest(load().enrollments.filter(e => e.email === email)),
    byKey: async key => load().enrollments.find(e => e.access_key === key) || null,
    forWeek: async (email, startsOn) => load().enrollments.find(e => e.email === email && e.starts_on === startsOn) || null,
    insert: async row => change(d => { if (!d.enrollments.some(e => e.email === row.email && e.starts_on === row.starts_on)) d.enrollments.push({ id: crypto.randomUUID(), ...row }); }),
    markZalo: async id => change(d => { const row = d.enrollments.find(e => e.id === id); row.zalo_clicked_at ||= new Date().toISOString(); }),
    people: async startsOn => { const { enrollments, joins } = load(); return enrollments.filter(e => e.starts_on === startsOn).reverse().map(e => ({ ...e, joins: Object.values(joins).filter(j => j.enrollment_id === e.id && j.clicks > 0) })); },
    linkEvent: async (slug, starts_on, kind, visitor) => change(d => { d.links ||= {}; const key = `${slug}:${kind}:${visitor}`; d.links[key] = { slug, starts_on, kind, hits: (d.links[key]?.hits || 0) + 1 }; }),
    linkStats: async dates => { const totals = new Map(); for (const row of Object.values(load().links || {})) { if (!dates.includes(row.starts_on)) continue; const key = `${row.slug}:${row.kind}`; const total = totals.get(key) || { starts_on: row.starts_on, slug: row.slug, kind: row.kind, people: 0, hits: 0 }; total.people += 1; total.hits += row.hits; totals.set(key, total); } return [...totals.values()]; },
    room: async (id, position) => load().joins[`${id}:${position}`]?.room_url || '',
    recordJoin: async (id, position, roomUrl) => change(d => { const key = `${id}:${position}`, old = d.joins[key]; d.joins[key] = { enrollment_id: id, position, room_url: roomUrl || old?.room_url || '', clicks: (old?.clicks || 0) + 1 }; }),
  };
}

// As the other local stores: only an unreachable database in development uses the file.
function withDevelopmentFile(primary, file, enabled = process.env.NODE_ENV !== 'production') {
  const local = createFileRepository(file);
  const unreachable = error => enabled && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code);
  return Object.fromEntries(Object.keys(primary).map(name => [name, async (...args) => {
    try { return await primary[name](...args); }
    catch (error) { if (!unreachable(error)) throw error; return local[name](...args); }
  }]));
}

function createWebinarProgramService({ repository, crm, everwebinar, now: clock = () => new Date(), database } = {}) {
  repository ||= withDevelopmentFile(createRepository(database || require('./db').pool), path.join(__dirname, '..', 'data', 'webinar_program.json'));
  crm ||= require('./storage');
  everwebinar ||= require('./webinarService');
  const read = async () => normalizeSettings(await crm.getCrmSetting(SETTINGS_KEY, {}));

  async function saveSettings(body = {}) {
    const current = await read();
    // The masked key coming back from the form means "keep the one already saved".
    const key = clean(body.api_key);
    const next = normalizeSettings({ ...body, api_key: key === MASK ? current.api_key : key });
    validate(next);
    await crm.setCrmSetting(SETTINGS_KEY, next);
    return publicSettings(next);
  }

  // The running and recent cohorts, the one collecting registrations and the next weeks.
  async function overview({ past = 8, ahead = 8 } = {}) {
    const settings = await read();
    const now = clock();
    const collecting = startsOnFor(now, settings.cutoff_time);
    const dates = Array.from({ length: past + ahead + 1 }, (_, i) => addDays(collecting, (i - past) * 7))
      .filter(date => !settings.first_starts_on || date >= settings.first_starts_on);
    const [saved, counts, joins, linkRows] = await Promise.all([repository.groups(dates), repository.counts(dates), repository.joinCounts(dates), repository.linkStats(dates)]);
    // The numbers of each link of a week; the week's current link is always listed.
    const linksOf = cohort => {
      const slug = weekSlug(cohort);
      const slugs = [slug, ...new Set(linkRows.filter(r => r.starts_on === cohort.starts_on && r.slug !== slug).map(r => r.slug))];
      const of = (name, kind) => linkRows.find(r => r.slug === name && r.kind === kind);
      return slugs.map(name => ({ slug: name, path: `${BASE_PATH}/${name}`, visits: of(name, 'visit')?.hits || 0, visitors: of(name, 'visit')?.people || 0, registered: of(name, 'registered')?.people || 0, entered: of(name, 'entered')?.people || 0 }));
    };
    const groups = new Map(saved.map(row => [row.starts_on, row]));
    const numbers = new Map(counts.map(row => [row.starts_on, row]));
    return {
      settings: publicSettings(settings),
      cohorts: dates.map(date => cohortOf(date, settings, now)).map(c => ({
        ...c, links: linksOf(c),
        people: numbers.get(c.starts_on)?.people || 0, zalo_clicks: numbers.get(c.starts_on)?.zalo_clicks || 0,
        session_joins: c.sessions.map(s => joins.find(j => j.starts_on === c.starts_on && j.position === s.position)?.people || 0),
        zalo_name: groups.get(c.starts_on)?.zalo_name || '', zalo_url: groups.get(c.starts_on)?.zalo_url || '',
        zalo_name_suggested: c.number == null ? '' : settings.zalo_name_template.replace('{k}', c.number),
      })),
    };
  }

  async function saveCohort(startsOn, body = {}) {
    const settings = await read();
    if (!isDate(startsOn) || !isMonday(startsOn)) throw fail('Khóa không hợp lệ.');
    const zaloUrl = clean(body.zalo_url), zaloName = clean(body.zalo_name).slice(0, 160);
    if (zaloUrl && !/^https:\/\/zalo\.me\/\S+$/.test(zaloUrl)) throw fail('Link nhóm Zalo phải bắt đầu bằng https://zalo.me/.');
    await repository.saveGroup(startsOn, zaloName, zaloUrl);
    return { ...cohortOf(startsOn, settings, clock()), zalo_name: zaloName, zalo_url: zaloUrl };
  }

  // Admin: everyone in one cohort, with the Zalo click and the sessions they entered.
  async function people(startsOn) {
    if (!isDate(startsOn) || !isMonday(startsOn)) throw fail('Khóa không hợp lệ.');
    const settings = await read();
    const cohort = cohortOf(startsOn, settings, clock());
    const rows = await repository.people(startsOn);
    const leads = [];
    for (let i = 0; i < rows.length; i += 20) leads.push(...await Promise.all(rows.slice(i, i + 20).map(row => crm.getRegistrationById(row.registration_id).catch(() => null))));
    return {
      cohort: { starts_on: startsOn, label: cohort.label, status: cohort.status, sessions: cohort.sessions },
      people: rows.map((row, i) => ({
        registration_id: row.registration_id, email: row.email, name: leads[i]?.name || '', phone: leads[i]?.phone || '', assigned_to: leads[i]?.assigned_to || '',
        registered_at: leads[i]?.registered_at || row.created_at, zalo_clicked_at: row.zalo_clicked_at || null,
        utm_source: leads[i]?.utm_source || '', joins: row.joins || [],
      })),
    };
  }

  // What the thank-you and study pages show for one person. No name, email or phone.
  async function viewOf(enrollment, settings) {
    settings ||= await read();
    const now = clock().getTime();
    const cohort = cohortOf(enrollment.starts_on, settings, now);
    const group = await repository.group(enrollment.starts_on);
    const sessions = cohort.sessions.map(s => {
      const at = Date.parse(s.at);
      return { position: s.position, at: s.at, open: now >= at - OPENS_BEFORE && now < at + CLOSES_AFTER, past: now >= at + CLOSES_AFTER };
    });
    return {
      title: settings.title, label: cohort.label, starts_on: cohort.starts_on, status: cohort.status, ended: cohort.status === 'done',
      sessions, open_position: sessions.find(s => s.open)?.position || null, next_at: sessions.find(s => !s.open && !s.past)?.at || null,
      first_at: sessions[0]?.at || null,
      zalo: { name: group?.zalo_name || '', available: !!group?.zalo_url, href: `${BASE_PATH}/zalo/${enrollment.access_key}` },
      key: enrollment.access_key, page_href: `${BASE_PATH}/vao/${enrollment.access_key}`, go_href: `${BASE_PATH}/go/${enrollment.access_key}`,
    };
  }

  // A person's cohort: the one they already have unless it has ended, else the one collecting now.
  // The week a direct link belongs to, while that week is studying.
  const studyingWeek = (slug, settings) => {
    const startsOn = startsOnOfSlug(slug);
    return startsOn && cohortOf(startsOn, settings, clock()).status === 'running' ? startsOn : '';
  };
  // The person in one given week (added when missing).
  async function inWeek(email, registrationId, startsOn, settings) {
    await repository.insert({ starts_on: startsOn, registration_id: registrationId, email, access_key: crypto.randomBytes(18).toString('base64url') });
    return viewOf(await repository.forWeek(email, startsOn), settings);
  }

  // Landing: the person's cohort by the cutoff rule (or the one they already have). Direct
  // week link (options.week) during the study days: that week, so they study tonight.
  async function enroll(lead, options = {}) {
    const email = emailKey(lead.email);
    if (!email) throw fail('Thiếu email.');
    const settings = await read();
    const week = studyingWeek(options.week, settings);
    if (week) return inWeek(email, lead.id, week, settings);
    const latest = await repository.latest(email);
    if (latest && cohortOf(latest.starts_on, settings, clock()).status !== 'done') return viewOf(latest, settings);
    await repository.insert({ starts_on: startsOnFor(clock(), settings.cutoff_time), registration_id: lead.id, email, access_key: crypto.randomBytes(18).toString('base64url') });
    return viewOf(await repository.latest(email), settings);
  }

  // Fields n8n needs for the reminders and the link in its messages.
  async function webhookFields(view) {
    const { SITE_URL } = require('./site');
    const group = await repository.group(view.starts_on);
    return { webinar_cohort: view.label, webinar_starts_on: view.starts_on, webinar_first_session_at: view.first_at, webinar_session_times: view.sessions.map(s => vnStamp(s.at)).join(', '), webinar_join_url: `${SITE_URL}${view.page_href}`, webinar_zalo_name: group?.zalo_name || '', webinar_zalo_url: group?.zalo_url || '' };
  }

  async function publicConfig() {
    const settings = await read();
    const cohort = cohortOf(startsOnFor(clock(), settings.cutoff_time), settings, clock());
    return { title: settings.title, label: cohort.label, starts_on: cohort.starts_on, sessions: cohort.sessions.map(s => ({ position: s.position, at: s.at })) };
  }

  // /w/dong-tien sends people to the link of the week the cohort rule gives at this moment.
  async function currentLink() {
    const settings = await read();
    const thisWeek = mondayOf(clock());
    const studying = ['collecting', 'running'].includes(cohortOf(thisWeek, settings, clock()).status);
    const week = studying ? thisWeek : startsOnFor(clock(), settings.cutoff_time);
    return `${BASE_PATH}/${weekSlug(cohortOf(week, settings, clock()))}`;
  }
  // A known person on a direct week link: into that week while it studies, else their own page.
  async function enterWeek(body = {}) {
    const enrollment = await repository.byKey(clean(body.key));
    if (!enrollment) throw fail('Không tìm thấy thông tin đăng ký.', 404);
    const settings = await read();
    const week = studyingWeek(body.slug, settings);
    return week ? inWeek(enrollment.email, enrollment.registration_id, week, settings) : viewOf(enrollment, settings);
  }
  // A week link works while its cohort takes registrations or studies.
  async function linkOpen(slug) {
    const startsOn = startsOnOfSlug(slug);
    if (!startsOn) return false;
    return ['collecting', 'running'].includes(cohortOf(startsOn, await read(), clock()).status);
  }
  // Measured per link: who opened it and who registered through it ("entered" comes from go()).
  async function linkEvent(body = {}) {
    const slug = clean(body.slug), kind = clean(body.kind), visitor = clean(body.visitor).slice(0, 64);
    if (!['visit', 'registered'].includes(kind) || !visitor || !await linkOpen(slug)) return { success: false };
    await repository.linkEvent(slug, startsOnOfSlug(slug), kind, visitor);
    return { success: true };
  }

  // /w/dong-tien: an enrolled email goes to its page; anyone else fills in the form.
  async function check(body = {}) {
    const email = emailKey(body.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw fail('Vui lòng nhập email hợp lệ (ví dụ: ban@gmail.com).');
    const latest = await repository.latest(email);
    return latest ? { found: true, key: latest.access_key } : { found: false };
  }

  async function session(key) {
    const enrollment = await repository.byKey(clean(key));
    if (!enrollment) throw fail('Không tìm thấy thông tin đăng ký.', 404);
    return viewOf(enrollment);
  }

  // Someone whose cohort has ended moves to the one collecting now.
  async function rejoin(key) {
    const enrollment = await repository.byKey(clean(key));
    if (!enrollment) throw fail('Không tìm thấy thông tin đăng ký.', 404);
    return enroll({ id: enrollment.registration_id, email: enrollment.email });
  }

  // The person's own EverWebinar room (registered on the first click, so the form stays fast),
  // or the session's direct link when there is no key or EverWebinar does not answer.
  async function roomUrl(enrollment, position, settings, cohort, context) {
    const saved = await repository.room(enrollment.id, position);
    if (saved) return saved;
    const session = settings.sessions.filter(s => s.enabled).sort((a, b) => a.weekday - b.weekday)[position - 1];
    if (settings.api_key && session.webinar_id) {
      try {
        const lead = await crm.getRegistrationById(enrollment.registration_id);
        let timer;
        const room = await Promise.race([
          everwebinar.registerSessionRoom({ apiKey: settings.api_key, webinarId: session.webinar_id, at: vnStamp(cohort.sessions[position - 1].at), lead: { name: lead?.name, email: enrollment.email, ip: context.ip } }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('EverWebinar timeout')), EVERWEBINAR_TIMEOUT); }),
        ]).finally(() => clearTimeout(timer));
        if (room) return room;
      } catch (error) {
        console.warn('[webinar-program] EverWebinar unavailable, using the direct link:', error.code || error.message);
      }
    }
    return session.direct_url;
  }

  // Where "Vào học" sends the person now; null when no session is open.
  async function go(key, context = {}) {
    const enrollment = await repository.byKey(clean(key));
    if (!enrollment) throw fail('Không tìm thấy thông tin đăng ký.', 404);
    const settings = await read();
    const cohort = cohortOf(enrollment.starts_on, settings, clock());
    const view = await viewOf(enrollment, settings);
    if (!view.open_position) return null;
    const url = await roomUrl(enrollment, view.open_position, settings, cohort, context);
    if (!url) throw fail('Buổi học chưa có link vào phòng. Vui lòng liên hệ 086.242.1919.', 503);
    const personal = await repository.room(enrollment.id, view.open_position);
    const direct = settings.sessions.some(s => s.direct_url === url);
    await repository.recordJoin(enrollment.id, view.open_position, personal || (direct ? '' : url));
    if (startsOnOfSlug(context.via)) await repository.linkEvent(clean(context.via), startsOnOfSlug(context.via), 'entered', enrollment.id).catch(error => console.warn('[webinar-program] link count failed:', error.message));
    return url;
  }

  // Admin check of one session's room with the saved key and Webinar ID, for the admin's own
  // email (the study page only opens rooms at session time). Says which way the room came.
  async function testRoom(position, email) {
    const settings = await read();
    const session = settings.sessions.filter(s => s.enabled).sort((a, b) => a.weekday - b.weekday)[Number(position) - 1];
    if (!session) throw fail('Buổi này chưa bật.');
    const at = cohortOf(startsOnFor(clock(), settings.cutoff_time), settings, clock()).sessions[Number(position) - 1]?.at;
    let problem = '';
    if (settings.api_key && session.webinar_id && emailKey(email)) {
      try {
        const url = await everwebinar.registerSessionRoom({ apiKey: settings.api_key, webinarId: session.webinar_id, at: vnStamp(at), lead: { name: 'Admin kiểm tra', email: emailKey(email) } });
        if (url) return { source: 'api', url };
        problem = 'EverWebinar không trả về link phòng.';
      } catch (error) { problem = error.message || 'EverWebinar báo lỗi.'; }
    } else problem = !settings.api_key ? 'Chưa có API key.' : !session.webinar_id ? 'Buổi này chưa có Webinar ID.' : 'Tài khoản admin không có email.';
    if (session.direct_url) return { source: 'direct', url: session.direct_url, problem };
    throw fail(`Không lấy được phòng: ${problem} Buổi này cũng chưa có link vào thẳng.`);
  }

  async function zalo(key) {
    const enrollment = await repository.byKey(clean(key));
    if (!enrollment) return null;
    const group = await repository.group(enrollment.starts_on);
    if (!group?.zalo_url) return null;
    await repository.markZalo(enrollment.id);
    return group.zalo_url;
  }

  return { overview, people, testRoom, saveSettings, saveCohort, enroll, enterWeek, webhookFields, publicConfig, currentLink, linkOpen, linkEvent, check, session, rejoin, go, zalo };
}

let service;
const getWebinarProgramService = () => (service ||= createWebinarProgramService());
// For tests: the routes then use this service (in-memory storage, no EverWebinar).
const useWebinarProgramService = custom => { service = custom; };
const isWebinarProgram = pageId => pageId === PROGRAM;

module.exports = { PROGRAM, SETTINGS_KEY, MASK, DEFAULTS, BASE_PATH, startsOnFor, cohortOf, normalizeSettings, validate, createRepository, withDevelopmentFile, createWebinarProgramService, getWebinarProgramService, useWebinarProgramService, isWebinarProgram };
