// Admin reports and actions on Zoom events (roadmap 3.6 Z3, docs/zoom-event-plan.md §5–6):
// events with their funnel (registered → link → clicked → attended → stayed to the end),
// sessions, people and attendances not matched to a person. Computed on read: the data is small.
const { pool } = require('./db');
const { refresh, prefixOf } = require('./zoomEvents');

const MINUTE = 60000;
const STAY_SHARE = 2 / 3; // "ở lại đến cuối": present for at least 2/3 of the sessions' length
const time = value => value ? new Date(value).getTime() : NaN;
const personKey = row => row.contact_id ? `c:${row.contact_id}` : `e:${String(row.email || row.lead_email || '').trim().toLowerCase()}`;

// Minutes present in a session: union of join/leave intervals, clipped to the session (rule 9),
// so rejoining or two devices never count twice and waiting before the start does not count.
function minutesPresent(rows, session) {
  const start = time(session.start_time), end = start + session.minutes * MINUTE;
  const spans = rows.map(r => {
    const join = time(r.join_time), leave = Number.isFinite(time(r.leave_time)) ? time(r.leave_time) : join + Number(r.duration || 0) * 1000;
    return [Math.max(join, start), Math.min(leave, end)];
  }).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a).sort((x, y) => x[0] - y[0]);
  let total = 0, cur = null;
  for (const span of spans) {
    if (!cur || span[0] > cur[1]) { if (cur) total += cur[1] - cur[0]; cur = [...span]; }
    else cur[1] = Math.max(cur[1], span[1]);
  }
  if (cur) total += cur[1] - cur[0];
  return Math.round(total / MINUTE);
}

async function loadEvents(database, where = 'true', params = []) {
  return (await database.query(`select * from public.zoom_events where ${where} order by coalesce(starts_at, created_at) desc`, params)).rows;
}

// Everything the reports need for some events, in a few queries.
async function eventData(database, eventIds) {
  if (!eventIds.length) return { sessions: [], regs: [], att: [] };
  const [sessions, regs, att] = await Promise.all([
    database.query(`select s.event_id, s.zoom_meeting_uuid, s.source, s.excluded, m.topic, m.start_time, m.duration, m.zoom_meeting_id, m.hidden
      from public.zoom_event_sessions s join public.zoom_meetings m on m.zoom_meeting_uuid = s.zoom_meeting_uuid where s.event_id = any($1) order by m.start_time`, [eventIds]),
    database.query(`select z.event_id, z.key, z.email, z.registration_id, z.contact_id, z.created_at, z.data->>'join_url' <> '' as has_link, coalesce(z.data->>'zoom_error', '') as zoom_error,
        coalesce((z.data->>'join_clicks')::int, 0) as clicks, z.data->>'first_join_click_at' as first_click, coalesce((z.data->>'is_new_lead')::boolean, false) as is_new_lead,
        coalesce(z.data->'source'->>'utm_source', r.utm_source, '') as source, coalesce(c.display_name, r.name, z.data->>'name', '') as name, c.primary_phone as phone
      from public.zoom_event_registrations z left join public.registrations r on r.id = z.registration_id left join public.contacts c on c.id = z.contact_id
      where z.event_id = any($1)`, [eventIds]),
    database.query(`select a.id, s.event_id, a.zoom_meeting_uuid, a.lead_email, a.zoom_display_name, a.contact_id, a.match_source, a.join_time, a.leave_time, a.duration, c.display_name as contact_name
      from public.lead_zoom_attendances a join public.zoom_event_sessions s on s.zoom_meeting_uuid = a.zoom_meeting_uuid and not s.excluded
      left join public.contacts c on c.id = a.contact_id where s.event_id = any($1)`, [eventIds]),
  ]);
  return { sessions: sessions.rows, regs: regs.rows, att: att.rows };
}

// One event's people: registrations and attendances joined by person (contact, else email).
function summarize(event, { sessions, regs, att }) {
  const counted = sessions.filter(s => s.event_id === event.id && !s.excluded).map(s => ({ ...s, minutes: Number(s.duration) || event.duration_minutes }));
  const totalMinutes = counted.reduce((sum, s) => sum + s.minutes, 0) || event.duration_minutes;
  const people = new Map();
  const get = key => { if (!people.has(key)) people.set(key, { key, registration: null, attendances: [], minutes: 0 }); return people.get(key); };
  for (const r of regs.filter(r => r.event_id === event.id)) get(personKey(r)).registration = r;
  for (const a of att.filter(a => a.event_id === event.id)) get(personKey(a)).attendances.push(a);
  for (const p of people.values()) {
    p.minutes = counted.reduce((sum, s) => sum + minutesPresent(p.attendances.filter(a => a.zoom_meeting_uuid === s.zoom_meeting_uuid), s), 0);
    p.attended = p.attendances.length > 0;
    p.stayed = p.attended && p.minutes >= totalMinutes * STAY_SHARE;
  }
  const list = [...people.values()];
  const registered = list.filter(p => p.registration);
  return {
    totalMinutes, counted, list,
    stats: {
      registrations: registered.length,
      links: registered.filter(p => p.registration.has_link).length,
      clicked: registered.filter(p => p.registration.clicks > 0).length,
      attended: registered.filter(p => p.attended).length,
      stayed: registered.filter(p => p.stayed).length,
      attendees: list.filter(p => p.attended).length,
      stayed_all: list.filter(p => p.stayed).length,
      walkins: list.filter(p => p.attended && !p.registration).length,
      unmatched: list.filter(p => p.attended && p.key.startsWith('e:') && !p.registration).length,
      sessions: counted.length,
      stay_minutes: Math.ceil(totalMinutes * STAY_SHARE),
    },
  };
}

const eventRow = (event, stats) => ({
  id: event.id, title: event.title, zoom_kind: event.zoom_kind, zoom_id: event.zoom_id, starts_at: event.starts_at, duration_minutes: event.duration_minutes,
  status: event.status, has_page: event.has_page, closed_at: event.closed_at, stats,
});

async function listEvents({ database = pool } = {}) {
  const events = await loadEvents(database);
  const data = await eventData(database, events.map(e => e.id));
  const rows = events.map(e => eventRow(e, summarize(e, data).stats));
  const [sessions, recent] = await Promise.all([
    database.query(`select count(*) filter (where s.zoom_meeting_uuid is null and not m.hidden)::int as unassigned from public.zoom_meetings m left join public.zoom_event_sessions s on s.zoom_meeting_uuid = m.zoom_meeting_uuid`),
    database.query(`select count(*)::int as n from public.zoom_event_registrations where created_at > now() - interval '30 days'`),
  ]);
  const past = rows.filter(r => r.stats.registrations && r.stats.sessions);
  const sum = key => past.reduce((total, r) => total + r.stats[key], 0);
  const open = rows.find(r => r.has_page && r.status === 'open') || null;
  return {
    rows, open,
    kpis: {
      registrations_30d: recent.rows[0].n,
      attendance_rate: sum('registrations') ? sum('attended') / sum('registrations') : null,
      stayed_rate: sum('attended') ? sum('stayed') / sum('attended') : null,
      unmatched: rows.reduce((total, r) => total + r.stats.unmatched, 0),
      unassigned_sessions: sessions.rows[0].unassigned,
    },
  };
}

async function listSessions({ view = 'all', database = pool } = {}) {
  const where = view === 'hidden' ? 'm.hidden' : view === 'unassigned' ? 'not m.hidden and s.event_id is null' : 'not m.hidden';
  const { rows } = await database.query(`select m.zoom_meeting_uuid, m.zoom_meeting_id, m.topic, m.start_time, m.duration, m.hidden, m.hidden_by, coalesce(m.raw->>'type', '') as type,
      s.event_id, s.source, s.excluded, e.title as event_title,
      (select count(distinct lower(a.lead_email)) from public.lead_zoom_attendances a where a.zoom_meeting_uuid = m.zoom_meeting_uuid)::int as people,
      (select count(distinct a.contact_id) from public.lead_zoom_attendances a where a.zoom_meeting_uuid = m.zoom_meeting_uuid)::int as contacts
    from public.zoom_meetings m left join public.zoom_event_sessions s on s.zoom_meeting_uuid = m.zoom_meeting_uuid left join public.zoom_events e on e.id = s.event_id
    where ${where} order by m.start_time desc nulls last limit 300`);
  const counts = (await database.query(`select count(*) filter (where not m.hidden)::int as all, count(*) filter (where not m.hidden and s.event_id is null)::int as unassigned, count(*) filter (where m.hidden)::int as hidden
    from public.zoom_meetings m left join public.zoom_event_sessions s on s.zoom_meeting_uuid = m.zoom_meeting_uuid`)).rows[0];
  return { rows, counts };
}

async function eventDetail(id, { database = pool } = {}) {
  const [event] = await loadEvents(database, 'id::text = $1', [String(id)]);
  if (!event) return null;
  const data = await eventData(database, [event.id]);
  const { stats, list, counted, totalMinutes } = summarize(event, data);
  // People already known before signing up (registration to another funnel first).
  const known = (await database.query(`select count(*)::int as n from public.zoom_event_registrations z
    where z.event_id = $1 and exists (select 1 from public.registrations r where r.contact_id = z.contact_id and r.page_id <> 'zoom-event' and r.registered_at < z.created_at)`, [event.id])).rows[0].n;
  // People in the room per minute of the main (longest) counted session.
  const main = [...counted].sort((a, b) => b.minutes - a.minutes)[0];
  let curve = [];
  if (main) {
    const rows = data.att.filter(a => a.zoom_meeting_uuid === main.zoom_meeting_uuid);
    const start = time(main.start_time), step = Math.max(1, Math.ceil(main.minutes / 60));
    for (let minute = 0; minute <= main.minutes; minute += step) {
      const at = start + minute * MINUTE;
      const here = new Set(rows.filter(r => time(r.join_time) <= at && (Number.isFinite(time(r.leave_time)) ? time(r.leave_time) : time(r.join_time) + Number(r.duration || 0) * 1000) > at).map(personKey));
      curve.push({ minute, people: here.size });
    }
  }
  const sources = {};
  for (const p of list.filter(p => p.registration)) {
    const key = p.registration.source || '(direct)';
    sources[key] ||= { source: key, registrations: 0, attended: 0 };
    sources[key].registrations++;
    if (p.attended) sources[key].attended++;
  }
  const people = list.map(p => {
    const r = p.registration, a = p.attendances[0];
    return {
      key: p.key, contact_id: r?.contact_id || a?.contact_id || null,
      name: r?.name || a?.contact_name || a?.zoom_display_name || '', email: r?.email || a?.lead_email || '',
      registered_at: r?.created_at || null, source: r?.source || '', is_new_lead: !!r?.is_new_lead,
      has_link: !!r?.has_link, zoom_error: r && !r.has_link ? r.zoom_error : '', clicks: r?.clicks || 0, first_click: r?.first_click || null,
      attended: p.attended, minutes: p.minutes, stayed: p.stayed, emails_in_zoom: [...new Set(p.attendances.map(x => x.lead_email))],
      status: !r ? 'walkin' : p.stayed ? 'stayed' : p.attended ? 'attended' : r.clicks ? 'clicked' : 'absent',
    };
  }).sort((x, y) => (y.minutes - x.minutes) || String(x.name).localeCompare(String(y.name)));
  // Attendees without a person: suggestions by display name (never merged automatically).
  const unmatchedRows = data.att.filter(a => !a.contact_id);
  const byEmail = new Map();
  for (const a of unmatchedRows) {
    const key = String(a.lead_email || '').toLowerCase() || `name:${a.zoom_display_name}`;
    if (!byEmail.has(key)) byEmail.set(key, { attendance_ids: [], email: a.lead_email, name: a.zoom_display_name, rows: [] });
    byEmail.get(key).attendance_ids.push(a.id); byEmail.get(key).rows.push(a);
  }
  const unmatched = [];
  for (const u of byEmail.values()) {
    const minutes = counted.reduce((sum, s) => sum + minutesPresent(u.rows.filter(r => r.zoom_meeting_uuid === s.zoom_meeting_uuid), s), 0);
    const words = String(u.name || '').trim();
    const suggestions = words.length >= 3 ? (await database.query(`select id, display_name, primary_email from public.contacts where merged_into is null and display_name ilike $1 order by last_registered_at desc nulls last limit 3`, [`%${words.replace(/[\\%_]/g, ch => `\\${ch}`)}%`])).rows : [];
    unmatched.push({ attendance_ids: u.attendance_ids, email: u.email, name: u.name, minutes, suggestions });
  }
  return {
    event: { ...eventRow(event, stats), page: event.page, legacy_key: event.legacy_key, prefix: prefixOf(event) },
    stats: { ...stats, known_before: known, new_people: Math.max(0, stats.registrations - known) },
    total_minutes: totalMinutes,
    curve, sources: Object.values(sources).sort((a, b) => b.registrations - a.registrations),
    people, unmatched: unmatched.sort((a, b) => b.minutes - a.minutes),
    sessions: data.sessions.map(s => ({ zoom_meeting_uuid: s.zoom_meeting_uuid, topic: s.topic, start_time: s.start_time, duration: s.duration, source: s.source, excluded: s.excluded,
      people: new Set(data.att.filter(a => a.zoom_meeting_uuid === s.zoom_meeting_uuid).map(personKey)).size })),
  };
}

// ── Actions ──────────────────────────────────────────────────────────────────
const fail = (status, message) => Object.assign(new Error(message), { status });

async function createEvent({ title, zoom_kind, zoom_id, starts_at, duration_minutes, has_page = true, from_session }, { database = pool } = {}) {
  let room = { zoom_kind: zoom_kind === 'webinar' ? 'webinar' : 'meeting', zoom_id: String(zoom_id || '').replace(/\s+/g, ''), starts_at: starts_at || null, duration: Number(duration_minutes) || 120, title: String(title || '').trim() };
  if (from_session) {
    const m = (await database.query('select zoom_meeting_id, topic, start_time, duration from public.zoom_meetings where zoom_meeting_uuid = $1', [from_session])).rows[0];
    if (!m) throw fail(404, 'Không tìm thấy buổi Zoom.');
    room = { ...room, zoom_id: m.zoom_meeting_id, starts_at: m.start_time, duration: Number(m.duration) || room.duration, title: room.title || m.topic || `Zoom ${m.zoom_meeting_id}` };
  }
  if (!room.title) throw fail(400, 'Nhập tên sự kiện.');
  if (!from_session && room.zoom_id && !/^\d{9,12}$/.test(room.zoom_id)) throw fail(400, 'Meeting/Webinar ID gồm 9–12 chữ số.');
  const { rows: [event] } = await database.query(`insert into public.zoom_events (title, zoom_kind, zoom_id, starts_at, duration_minutes, status, has_page, closed_at)
    values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [room.title.slice(0, 300), room.zoom_kind, room.zoom_id, room.starts_at, Math.min(1440, Math.max(15, room.duration)), from_session ? 'closed' : 'draft', !!has_page && !from_session, from_session ? room.starts_at : null]);
  if (from_session) await database.query(`insert into public.zoom_event_sessions (zoom_meeting_uuid, event_id, source) values ($1, $2, 'manual')
    on conflict (zoom_meeting_uuid) do update set event_id = excluded.event_id, source = 'manual', excluded = false, updated_at = now()`, [from_session, event.id]);
  await refresh({ database });
  return event.id;
}

// Opens an event on /zoom: the open one closes (its links then lead to this one).
async function openEvent(id, { database = pool } = {}) {
  const client = await database.connect();
  try {
    await client.query('begin');
    const event = (await client.query('select id, zoom_id, page from public.zoom_events where id = $1 for update', [id])).rows[0];
    if (!event) throw fail(404, 'Không tìm thấy sự kiện.');
    if (!event.zoom_id) throw fail(400, 'Nhập Meeting/Webinar ID trước khi mở.');
    const open = (await client.query(`select id, page from public.zoom_events where has_page and status = 'open' and id <> $1 for update`, [id])).rows[0];
    if (open) await client.query(`update public.zoom_events set status = 'closed', closed_at = now(), updated_at = now() where id = $1`, [open.id]);
    // A new event starts from the page of the one it replaces (banner, footer...).
    const page = Object.keys(event.page || {}).length ? event.page : open?.page || {};
    await client.query(`update public.zoom_events set status = 'open', has_page = true, closed_at = null, page = $2, updated_at = now() where id = $1`, [id, JSON.stringify(page)]);
    await client.query('commit');
  } catch (error) { await client.query('rollback').catch(() => {}); throw error; }
  finally { client.release(); }
}

async function updateEvent(id, fields, { database = pool } = {}) {
  const sets = [], params = [id];
  const put = (column, value) => { params.push(value); sets.push(`${column} = $${params.length}`); };
  if (typeof fields.title === 'string' && fields.title.trim()) put('title', fields.title.trim().slice(0, 300));
  if (fields.starts_at !== undefined) put('starts_at', fields.starts_at || null);
  if (fields.duration_minutes !== undefined) put('duration_minutes', Math.min(1440, Math.max(15, Number(fields.duration_minutes) || 120)));
  if (fields.has_page !== undefined) put('has_page', !!fields.has_page);
  if (fields.status === 'closed') { put('status', 'closed'); sets.push('closed_at = coalesce(closed_at, now())'); }
  if (!sets.length) return;
  if ((await database.query(`update public.zoom_events set ${sets.join(', ')}, updated_at = now() where id = $1`, params)).rowCount === 0) throw fail(404, 'Không tìm thấy sự kiện.');
  await refresh({ database });
}

// A session goes to an event by hand (or leaves it: eventId null), or is kept out of its event.
async function setSession(uuid, { event_id, excluded, hidden } = {}, { database = pool } = {}) {
  if (event_id !== undefined) {
    if (event_id) await database.query(`insert into public.zoom_event_sessions (zoom_meeting_uuid, event_id, source) values ($1, $2, 'manual')
      on conflict (zoom_meeting_uuid) do update set event_id = excluded.event_id, source = 'manual', updated_at = now()`, [uuid, event_id]);
    else await database.query('delete from public.zoom_event_sessions where zoom_meeting_uuid = $1', [uuid]);
    if (event_id) await database.query(`update public.zoom_meetings set hidden = false, hidden_by = 'manual' where zoom_meeting_uuid = $1 and hidden`, [uuid]);
  }
  // Kept out of the event by hand: an automatic reassignment keeps the decision (source manual).
  if (excluded !== undefined) await database.query(`update public.zoom_event_sessions set excluded = $2, source = 'manual', updated_at = now() where zoom_meeting_uuid = $1`, [uuid, !!excluded]);
  if (hidden !== undefined) await database.query(`update public.zoom_meetings set hidden = $2, hidden_by = 'manual', updated_at = now() where zoom_meeting_uuid = $1`, [uuid, !!hidden]);
}

// An attendee without a person, linked by an admin (never by name automatically).
async function linkAttendances(attendanceIds, contactId, { source = 'manual', database = pool } = {}) {
  const ids = (attendanceIds || []).map(String).filter(Boolean);
  if (!ids.length || !contactId) throw fail(400, 'Chọn người tham dự và hồ sơ khách.');
  const latest = (await database.query('select id from public.registrations where contact_id = $1 order by registered_at desc limit 1', [contactId])).rows[0];
  if (!latest) throw fail(404, 'Không tìm thấy hồ sơ khách.');
  const { rowCount } = await database.query(`update public.lead_zoom_attendances set contact_id = $2, registration_id = coalesce(registration_id, $3), match_source = $4, updated_at = now() where id::text = any($1)`, [ids, contactId, latest.id, source]);
  return { linked: rowCount };
}

module.exports = { listEvents, listSessions, eventDetail, createEvent, openEvent, updateEvent, setSession, linkAttendances, minutesPresent, STAY_SHARE };
