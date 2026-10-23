// Zoom events (roadmap 3.6, docs/zoom-event-plan.md). An event is what people are invited to;
// its sessions are meetings reported by Zoom; registrations (/zoom) and attendances (Zoom sync)
// meet at the contact. This module holds the event store used by /zoom (src/zoomEvent.js), the
// one-off move of the old single /zoom setting into events, and refresh(): the rules that run
// after every Zoom sync and nightly (assign sessions, hide internal meetings, match people).
const { pool } = require('./db');

const HOUR = 3600000;
// Fields of the old setting that describe the Zoom room and time; the rest is page content.
const ROOM_FIELDS = ['zoom_kind', 'zoom_id', 'starts_at', 'duration_minutes'];
const pageOf = settings => Object.fromEntries(Object.entries(settings || {}).filter(([key]) => !ROOM_FIELDS.includes(key) && key !== 'event'));
const COLUMNS = 'id, title, zoom_kind, zoom_id, starts_at, duration_minutes, status, has_page, page, legacy_key, closed_at, created_at, updated_at';

async function inTransaction(database, fn) {
  const client = await database.connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally { client.release(); }
}

// Registration key prefix of an event: the old "meeting:<id>" for events moved from the single
// setting (their registrations keep their keys and links), the event ID for newer ones.
const prefixOf = event => event.legacy_key || event.id;

function createEventStore({ database = pool, fallback = process.env.NODE_ENV !== 'production' } = {}) {
  // Without the database in development, /zoom keeps using the old single setting.
  const offline = error => fallback && (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code) || /zoom_events.*does not exist/i.test(error.message));
  // The open /zoom event; null when events exist but none is open (registration closed);
  // undefined before any event exists (the old single setting still decides).
  async function current() {
    try {
      const open = (await database.query(`select ${COLUMNS} from public.zoom_events where has_page and status = 'open' limit 1`)).rows[0];
      if (open) return open;
      return (await database.query('select 1 from public.zoom_events limit 1')).rows.length ? null : undefined;
    } catch (error) { if (offline(error)) return undefined; throw error; }
  }
  // Saves the /zoom page. Another Zoom room means another event: the open one closes (keeping
  // its page and registrations) and a new one opens, as a new room started fresh rows before.
  async function saveCurrent(settings, { title = '' } = {}) {
    try {
      return await inTransaction(database, async client => {
        const open = (await client.query(`select ${COLUMNS} from public.zoom_events where has_page and status = 'open' for update`)).rows[0];
        const values = [title, settings.zoom_kind, settings.zoom_id || '', settings.starts_at || null, settings.duration_minutes, JSON.stringify(pageOf(settings))];
        const newRoom = open && open.zoom_id && settings.zoom_id && (open.zoom_id !== settings.zoom_id || open.zoom_kind !== settings.zoom_kind);
        if (open && !newRoom) {
          return (await client.query(`update public.zoom_events set title = $1, zoom_kind = $2, zoom_id = $3, starts_at = $4, duration_minutes = $5, page = $6, updated_at = now() where id = $7 returning ${COLUMNS}`, [...values, open.id])).rows[0];
        }
        if (open) await client.query(`update public.zoom_events set status = 'closed', closed_at = now(), updated_at = now() where id = $1`, [open.id]);
        return (await client.query(`insert into public.zoom_events (title, zoom_kind, zoom_id, starts_at, duration_minutes, page, status, has_page) values ($1, $2, $3, $4, $5, $6, 'open', true) returning ${COLUMNS}`, values)).rows[0];
      });
    } catch (error) { if (offline(error)) return undefined; throw error; }
  }
  return { current, saveCurrent };
}

let store;
const getEventStore = () => store || (store = createEventStore());

/**
 * One-off: the events behind the old single /zoom setting (docs/zoom-event-plan.md §6).
 * Each event key of zoom_event_registrations becomes an event; the one in the setting is open
 * with its page, the others closed. Then registrations get their columns and refresh() runs.
 * apply: false computes in a transaction that is rolled back.
 */
async function moveLegacyEvents({ settings, titleOf = () => '', apply = false, database = pool } = {}) {
  const run = async client => {
    const counts = { events_created: 0, registrations_updated: 0 };
    const currentKey = settings?.zoom_id ? `${settings.zoom_kind}:${settings.zoom_id}` : '';
    const { rows: keys } = await client.query(`select data->>'event_key' as key, min((data->>'created_at')::timestamptz) as first_at, max((data->>'created_at')::timestamptz) as last_at
      from public.zoom_event_registrations where coalesce(data->>'event_key', '') <> '' group by 1 order by 2`);
    if (currentKey && !keys.some(k => k.key === currentKey)) keys.push({ key: currentKey, first_at: null, last_at: null });
    for (const { key, first_at, last_at } of keys) {
      if ((await client.query('select 1 from public.zoom_events where legacy_key = $1', [key])).rows.length) continue;
      const [kind, zoomId] = key.split(':');
      const isCurrent = key === currentKey;
      // The session people registered for: the best attended meeting of this room after the
      // first sign-up (not a rehearsal before it).
      const meeting = (await client.query(`select m.topic, m.start_time, m.duration from public.zoom_meetings m
        where m.zoom_meeting_id = $1 and ($2::timestamptz is null or m.start_time >= $2::timestamptz - interval '1 day')
        order by (select count(*) from public.lead_zoom_attendances a where a.zoom_meeting_uuid = m.zoom_meeting_uuid) desc, m.start_time limit 1`, [zoomId, first_at])).rows[0];
      const startsAt = isCurrent && settings.starts_at ? settings.starts_at : meeting?.start_time || last_at || null;
      const title = isCurrent ? titleOf(settings) : meeting?.topic || `Zoom ${zoomId}`;
      const duration = isCurrent ? settings.duration_minutes : Number(meeting?.duration) || 120;
      await client.query(`insert into public.zoom_events (title, zoom_kind, zoom_id, starts_at, duration_minutes, status, has_page, page, legacy_key, closed_at)
        values ($1, $2, $3, $4, $5, $6, true, $7, $8, $9)`,
        [title.slice(0, 300), kind === 'webinar' ? 'webinar' : 'meeting', zoomId, startsAt, duration, isCurrent ? 'open' : 'closed', JSON.stringify(isCurrent ? pageOf(settings) : {}), key,
          isCurrent ? null : startsAt ? new Date(new Date(startsAt).getTime() + duration * 60000) : last_at]);
      counts.events_created++;
    }
    const updated = await client.query(`update public.zoom_event_registrations z set event_id = e.id, email = lower(z.data->>'email'), registration_id = nullif(z.data->>'registration_id', ''),
        created_at = (z.data->>'created_at')::timestamptz, contact_id = (select r.contact_id from public.registrations r where r.id = z.data->>'registration_id'), updated_at = z.updated_at
      from public.zoom_events e where e.legacy_key = z.data->>'event_key' and (z.event_id is null or z.contact_id is null)`);
    counts.registrations_updated = updated.rowCount;
    return { ...counts, ...await refresh({ database: client }) };
  };
  if (apply) return inTransaction(database, run);
  return inTransaction(database, async client => { throw Object.assign(new Error('dry run'), { dryRun: true, counts: await run(client) }); })
    .catch(error => { if (error.dryRun) return { ...error.counts, dry_run: true }; throw error; });
}

/**
 * Rules after each Zoom sync and nightly (docs/zoom-event-plan.md §5); safe to repeat.
 * 1. a session of an event's room joins the event when it starts between 12 h before the event
 *    and 12 h before the next event of that room (or one day after the event closed); personal
 *    meeting rooms (Zoom type 4) are never assigned automatically; manual choices stay;
 * 4. meetings with at most 5 people and nobody known are hidden (unless decided by hand);
 * 5. attendances get the contact of their lead, or of the one person owning their email.
 */
async function refresh({ database = pool } = {}) {
  const q = (sql, params) => database.query(sql, params);
  const { rows: events } = await q(`select id, zoom_kind, zoom_id, starts_at, closed_at, status from public.zoom_events where zoom_id <> '' and starts_at is not null order by zoom_id, starts_at`);
  const byRoom = new Map();
  for (const event of events) { if (!byRoom.has(event.zoom_id)) byRoom.set(event.zoom_id, []); byRoom.get(event.zoom_id).push(event); }
  let assigned = 0;
  for (const [zoomId, list] of byRoom) {
    for (let i = 0; i < list.length; i++) {
      const from = new Date(new Date(list[i].starts_at).getTime() - 12 * HOUR);
      const next = list[i + 1];
      const until = next ? new Date(new Date(next.starts_at).getTime() - 12 * HOUR) : list[i].closed_at ? new Date(new Date(list[i].closed_at).getTime() + 24 * HOUR) : null;
      const result = await q(`insert into public.zoom_event_sessions (zoom_meeting_uuid, event_id, source)
          select m.zoom_meeting_uuid, $2, 'auto' from public.zoom_meetings m
           where m.zoom_meeting_id = $1 and m.start_time >= $3 and ($4::timestamptz is null or m.start_time < $4) and coalesce(m.raw->>'type', '') <> '4'
        on conflict (zoom_meeting_uuid) do update set event_id = excluded.event_id, updated_at = now()
          where public.zoom_event_sessions.source = 'auto' and public.zoom_event_sessions.event_id <> excluded.event_id`, [zoomId, list[i].id, from, until]);
      assigned += result.rowCount;
    }
  }
  const attendances = await q(`with found as (
      select a.id, coalesce(
        (select r.contact_id from public.registrations r where r.id = a.registration_id),
        (select min(i.contact_id::text)::uuid from public.contact_identities i where i.kind = 'email' and i.value = lower(a.lead_email) having count(distinct i.contact_id) = 1)) as contact_id
      from public.lead_zoom_attendances a where a.contact_id is null and a.match_source = '')
    update public.lead_zoom_attendances a set contact_id = found.contact_id, match_source = 'email', updated_at = now()
      from found where a.id = found.id and found.contact_id is not null`);
  const hidden = await q(`update public.zoom_meetings m set hidden = true, hidden_by = 'auto', updated_at = now()
    where m.hidden_by = '' and not m.hidden
      and (select count(distinct lower(a.lead_email)) from public.lead_zoom_attendances a where a.zoom_meeting_uuid = m.zoom_meeting_uuid) <= 5
      and not exists (select 1 from public.lead_zoom_attendances a where a.zoom_meeting_uuid = m.zoom_meeting_uuid and a.contact_id is not null)
      and not exists (select 1 from public.zoom_event_sessions s where s.zoom_meeting_uuid = m.zoom_meeting_uuid and s.source = 'manual')`);
  return { sessions_assigned: assigned, attendances_matched: attendances.rowCount, meetings_hidden: hidden.rowCount };
}

module.exports = { createEventStore, getEventStore, moveLegacyEvents, refresh, prefixOf, pageOf };
