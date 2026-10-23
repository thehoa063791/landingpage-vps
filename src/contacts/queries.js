// Admin reads of the contacts layer (roadmap 3.2): the customer list and one customer with
// everything recorded about them. Registrations keep their own tags, notes, custom fields and
// orders; a customer shows the union of their registrations. Writes that change a person
// (sale, tags) are applied to their registrations so funnel views stay consistent.
const { pool } = require('../db');

const SORTS = { recent: 'c.last_registered_at desc nulls last', first: 'c.first_registered_at desc nulls last', name: 'c.display_name asc' };
const QUICK = new Set(['mine', 'today', 'no_note', 'unassigned', 'candidates', 'multi']);

// Digits of a phone as stored in contact_identities ('0912345678'), without the leading 0/84,
// so "912 345 678", "0912345678" and "+84 912..." all match.
function phoneNeedle(term) {
  let digits = String(term || '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.length >= 4 ? digits : '';
}
const likeEscape = value => String(value || '').replace(/[\\%_]/g, ch => `\\${ch}`);
// Start of today in Vietnam (UTC+7) as an ISO string.
function vnToday(now = new Date()) {
  const vn = new Date(now.getTime() + 7 * 3600000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600000).toISOString();
}

// Builds the where clause of the list. staffIds: authors whose notes count as care notes.
function listFilters({ q = '', owner = '', page = '', tag = '', source = '', quick = '', dateFrom = '', dateTo = '', userId = '', staffIds = [] }) {
  const where = ['c.merged_into is null'];
  const params = [];
  const param = value => { params.push(value); return `$${params.length}`; };
  const term = String(q || '').trim().slice(0, 100);
  if (term) {
    const ors = [`c.display_name ilike ${param(`%${likeEscape(term)}%`)}`];
    ors.push(`c.id in (select i.contact_id from public.contact_identities i where i.kind = 'email' and i.value like ${param(`%${likeEscape(term.toLowerCase())}%`)})`);
    const digits = phoneNeedle(term);
    if (digits) ors.push(`c.id in (select i.contact_id from public.contact_identities i where i.kind = 'phone' and i.value like ${param(`%${digits}%`)})`);
    where.push(`(${ors.join(' or ')})`);
  }
  if (owner === 'none') where.push('c.owner_id is null');
  else if (owner) where.push(`c.owner_id = ${param(owner)}`);
  // page: one page ID or several separated by commas (a funnel's page IDs).
  if (page) where.push(`exists (select 1 from public.registrations r where r.contact_id = c.id and r.page_id = any(${param(String(page).split(',').filter(Boolean))}::text[]))`);
  if (tag) where.push(`exists (select 1 from public.registrations r join public.lead_tags t on t.registration_id = r.id where r.contact_id = c.id and t.tag_id = ${param(tag)})`);
  if (source) where.push(`(c.first_touch->>'source' = ${param(source)} or c.last_touch->>'source' = $${params.length})`);
  if (dateFrom) where.push(`c.last_registered_at >= ${param(new Date(dateFrom).toISOString())}`);
  if (dateTo) where.push(`c.last_registered_at < ${param(new Date(dateTo).toISOString())}`);
  for (const key of String(quick || '').split(',').filter(k => QUICK.has(k))) {
    if (key === 'mine') where.push(userId ? `c.owner_id = ${param(userId)}` : 'false');
    if (key === 'unassigned') where.push('c.owner_id is null');
    if (key === 'today') where.push(`c.first_registered_at >= ${param(vnToday())}`);
    if (key === 'multi') where.push('c.id in (select r.contact_id from public.registrations r where r.contact_id is not null group by r.contact_id having count(distinct r.page_id) > 1)');
    if (key === 'candidates') where.push(`c.id in (select k.contact_a from public.contact_candidates k where k.status = 'open' union select k.contact_b from public.contact_candidates k where k.status = 'open')`);
    if (key === 'no_note') where.push(`not exists (select 1 from public.registrations r join public.lead_notes n on n.registration_id = r.id where r.contact_id = c.id and n.author_id = any(${param(staffIds)}::uuid[]))`);
  }
  return { where: where.join(' and '), params };
}

async function listContacts(options = {}, { database = pool } = {}) {
  const pageNum = Math.max(1, parseInt(options.pageNum, 10) || 1);
  const pageSize = Math.min(options.exportAll ? 5000 : 500, Math.max(1, parseInt(options.pageSize, 10) || 50));
  const { where, params } = listFilters(options);
  const order = SORTS[options.sort] || SORTS.recent;
  const staff = options.staffIds || [];
  const total = (await database.query(`select count(*)::int as n from public.contacts c where ${where}`, params)).rows[0].n;
  // The page is chosen first; the per-person details are then read for those rows only.
  const { rows } = await database.query(`
    with page as (
      select c.* from public.contacts c where ${where}
       order by ${order}, c.id limit ${pageSize} offset ${(pageNum - 1) * pageSize})
    select c.id, c.display_name, c.primary_email, c.primary_phone, c.owner_id, c.first_touch, c.last_touch,
           c.first_registered_at, c.last_registered_at, c.registrations_count,
           coalesce((select array_agg(distinct r.page_id) from public.registrations r where r.contact_id = c.id), '{}') as funnels,
           coalesce((select array_agg(distinct t.tag_id) from public.registrations r join public.lead_tags t on t.registration_id = r.id where r.contact_id = c.id), '{}') as tag_ids,
           (select max(r.last_interaction_at) from public.registrations r where r.contact_id = c.id) as last_interaction_at,
           (select r.id from public.registrations r where r.contact_id = c.id order by r.registered_at desc, r.id limit 1) as latest_registration_id,
           (select count(*)::int from public.registrations r join public.lead_notes n on n.registration_id = r.id where r.contact_id = c.id and n.author_id = any($${params.length + 1}::uuid[])) as notes_count,
           note.body as latest_note, note.created_at as latest_note_at, note.author_name as latest_note_author,
           exists (select 1 from public.contact_candidates k where k.status = 'open' and (k.contact_a = c.id or k.contact_b = c.id)) as has_candidates
      from page c
      left join lateral (
        select n.body, n.created_at, n.author_name from public.registrations r join public.lead_notes n on n.registration_id = r.id
         where r.contact_id = c.id and n.author_id = any($${params.length + 1}::uuid[])
         order by n.created_at desc limit 1) note on true
     order by ${order}, c.id`, [...params, staff]);
  return {
    total, pageNum, pageSize,
    rows: rows.map(row => {
      const lastInteraction = [row.last_interaction_at, row.latest_note_at].filter(Boolean).map(v => new Date(v).getTime());
      return {
        id: row.id,
        name: row.display_name,
        email: row.primary_email,
        phone: row.primary_phone,
        owner_id: row.owner_id || '',
        funnels: (row.funnels || []).filter(Boolean).sort(),
        tag_ids: row.tag_ids || [],
        first_touch: row.first_touch || null,
        last_touch: row.last_touch || null,
        first_registered_at: row.first_registered_at,
        last_registered_at: row.last_registered_at,
        registrations_count: row.registrations_count,
        latest_registration_id: row.latest_registration_id || '',
        latest_note: row.latest_note || '',
        notes_count: row.notes_count || 0,
        latest_note_author: row.latest_note_author || '',
        last_interaction_at: lastInteraction.length ? new Date(Math.max(...lastInteraction)).toISOString() : null,
        has_candidates: row.has_candidates,
      };
    }),
  };
}

// Counts for the list's views and filter menus: one query per view, run together.
const VIEWS = ['all', 'mine', 'today', 'no_note', 'unassigned', 'candidates'];
async function contactViews({ userId = '', staffIds = [], page = '' } = {}, { database = pool } = {}) {
  const count = async options => {
    const { where, params } = listFilters({ ...options, page, userId, staffIds });
    return (await database.query(`select count(*)::int as n from public.contacts c where ${where}`, params)).rows[0].n;
  };
  const [counts, multi, funnels, sources] = await Promise.all([
    Promise.all(VIEWS.map(view => count(view === 'all' ? {} : { quick: view }))),
    count({ quick: 'multi' }),
    database.query(`select r.page_id, count(distinct r.contact_id)::int as n from public.registrations r where r.contact_id is not null group by 1 order by 2 desc`),
    database.query(`select s as source, count(*)::int as n from (select c.first_touch->>'source' as s from public.contacts c where c.merged_into is null
                    union all select c.last_touch->>'source' from public.contacts c where c.merged_into is null and c.last_touch->>'source' is distinct from c.first_touch->>'source') x
                     where s is not null and s <> '' group by 1 order by 2 desc limit 30`),
  ]);
  return {
    views: Object.fromEntries(VIEWS.map((view, i) => [view, counts[i]])),
    multi_funnel: multi,
    funnels: funnels.rows.map(r => ({ id: r.page_id, count: r.n })),
    sources: sources.rows.map(r => ({ id: r.source, count: r.n })),
  };
}

// Bulk actions of the list: give several people one sale, or add one tag to each.
async function bulkUpdate(ids = [], { ownerId, setOwner = false, addTagId = '' } = {}, author = {}, { database = pool } = {}) {
  let changed = 0;
  for (const id of [...new Set(ids)].slice(0, 500)) {
    if (setOwner && await setContactOwner(id, ownerId || null, { database })) changed++;
    if (addTagId) {
      const contactId = await resolveContactId(id, { database });
      if (!contactId) continue;
      const latest = (await database.query('select id from public.registrations where contact_id = $1 order by registered_at desc, id limit 1', [contactId])).rows[0];
      const has = (await database.query('select 1 from public.lead_tags t join public.registrations r on r.id = t.registration_id where r.contact_id = $1 and t.tag_id = $2 limit 1', [contactId, addTagId])).rows.length;
      if (latest && !has) {
        await database.query(`insert into public.lead_tags (registration_id, tag_id, assigned_by, assigned_by_email, assigned_by_name) values ($1, $2, $3, $4, $5) on conflict do nothing`,
          [latest.id, addTagId, author.id || null, author.email || '', author.full_name || author.email || '']);
        changed++;
      }
    }
  }
  return { changed };
}

// The contact an ID points to now, following merges (an old link to a merged contact still opens).
async function resolveContactId(id, { database = pool } = {}) {
  let current = String(id || '');
  for (let hop = 0; hop < 10 && current; hop++) {
    const { rows } = await database.query('select id, merged_into from public.contacts where id::text = $1', [current]);
    if (!rows.length) return null;
    if (!rows[0].merged_into) return rows[0].id;
    current = rows[0].merged_into;
  }
  return null;
}

async function getContact(id, { database = pool } = {}) {
  const contactId = await resolveContactId(id, { database });
  if (!contactId) return null;
  const q = (sql, params = [contactId]) => database.query(sql, params).then(r => r.rows);
  const [[contact], registrations, identities, candidates] = await Promise.all([
    q('select * from public.contacts where id = $1'),
    q('select * from public.registrations where contact_id = $1 order by registered_at asc, id'),
    q('select kind, value, created_at from public.contact_identities where contact_id = $1 order by kind, created_at'),
    q(`select k.reason, k.created_at, case when k.contact_a = $1 then k.contact_b else k.contact_a end as other_id, o.display_name as other_name
         from public.contact_candidates k join public.contacts o on o.id = case when k.contact_a = $1 then k.contact_b else k.contact_a end
        where k.status = 'open' and (k.contact_a = $1 or k.contact_b = $1)`),
  ]);
  const ids = registrations.map(r => r.id);
  const emails = [...new Set(identities.filter(i => i.kind === 'email').map(i => i.value))];
  const byIds = sql => ids.length ? q(sql, [ids]) : Promise.resolve([]);
  const [notes, tags, customValues, orders, surveys, zoom, merges] = await Promise.all([
    byIds('select * from public.lead_notes where registration_id = any($1) order by created_at desc'),
    byIds(`select t.registration_id, t.tag_id, t.assigned_at, t.assigned_by_name, g.name, g.color, g.active, cat.name as category_name
             from public.lead_tags t join public.crm_tags g on g.id = t.tag_id left join public.crm_tag_categories cat on cat.id = g.category_id
            where t.registration_id = any($1) order by t.assigned_at`),
    byIds('select registration_id, field_id, value, updated_at from public.crm_custom_field_values where registration_id = any($1) order by updated_at desc'),
    byIds('select * from public.funnel_sales where registration_id = any($1) order by created_at desc'),
    byIds('select * from public.surveys where registration_id = any($1) order by submitted_at desc'),
    (ids.length || emails.length) ? q(`select a.id, a.registration_id, a.lead_email, a.zoom_meeting_uuid, a.zoom_meeting_id, a.zoom_display_name, a.join_time, a.leave_time, a.duration,
             m.topic, m.start_time, m.duration as meeting_duration
        from public.lead_zoom_attendances a left join public.zoom_meetings m on m.zoom_meeting_uuid = a.zoom_meeting_uuid
       where a.registration_id = any($1) or lower(a.lead_email) = any($2) order by a.join_time desc`, [ids, emails]) : Promise.resolve([]),
    q(`select action, reason, by_email, created_at from public.contact_merges where kept_id = $1 or merged_id = $1 order by created_at desc limit 50`),
  ]);
  // One tag once, with the funnels it came from.
  const tagMap = new Map();
  for (const t of tags) {
    if (!tagMap.has(t.tag_id)) tagMap.set(t.tag_id, { id: t.tag_id, name: t.name, color: t.color, category_name: t.category_name || '', active: t.active, registration_ids: [] });
    tagMap.get(t.tag_id).registration_ids.push(t.registration_id);
  }
  // A field shows its most recent non-empty value across registrations.
  const fieldValues = {};
  for (const v of customValues) {
    const empty = v.value === '' || v.value == null || (Array.isArray(v.value) && !v.value.length);
    if (!empty && !(v.field_id in fieldValues)) fieldValues[v.field_id] = { value: v.value, registration_id: v.registration_id, updated_at: v.updated_at };
  }
  return {
    contact, registrations, identities, candidates, notes,
    tags: [...tagMap.values()], custom_values: fieldValues, orders, surveys,
    zoom_attendances: dedupeAttendances(zoom), merges,
  };
}

// The same join can arrive twice (by registration and by email); keep one row per join.
function dedupeAttendances(rows) {
  const seen = new Set();
  return rows.filter(row => {
    const key = `${row.zoom_meeting_uuid}|${String(row.lead_email || '').toLowerCase()}|${row.join_time ? new Date(row.join_time).getTime() : ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Sale of a person: the contact and every registration of it (the funnel views read registrations).
async function setContactOwner(id, userId, { database = pool } = {}) {
  const contactId = await resolveContactId(id, { database });
  if (!contactId) return null;
  await database.query('update public.contacts set owner_id = $2, updated_at = now() where id = $1', [contactId, userId || null]);
  const { rowCount } = await database.query(
    `update public.registrations set assigned_to = $2, assigned_at = case when $2::uuid is null then null else now() end
      where contact_id = $1 and assigned_to is distinct from $2::uuid`, [contactId, userId || null]);
  return { contact_id: contactId, registrations_updated: rowCount };
}

// Tags of a person: a new tag goes on the latest registration, a removed tag leaves all of them.
async function setContactTags(id, tagIds = [], author = {}, { database = pool } = {}) {
  const contactId = await resolveContactId(id, { database });
  if (!contactId) return null;
  const regs = (await database.query('select id from public.registrations where contact_id = $1 order by registered_at desc, id', [contactId])).rows.map(r => r.id);
  if (!regs.length) return { contact_id: contactId, added: 0, removed: 0 };
  const active = new Set((await database.query('select id from public.crm_tags where active')).rows.map(r => r.id));
  const wanted = new Set((tagIds || []).filter(tagId => active.has(tagId)));
  const current = new Set((await database.query('select distinct tag_id from public.lead_tags where registration_id = any($1)', [regs])).rows.map(r => r.tag_id));
  const add = [...wanted].filter(tagId => !current.has(tagId));
  const remove = [...current].filter(tagId => !wanted.has(tagId) && active.has(tagId));
  if (remove.length) await database.query('delete from public.lead_tags where registration_id = any($1) and tag_id = any($2)', [regs, remove]);
  for (const tagId of add) {
    await database.query(`insert into public.lead_tags (registration_id, tag_id, assigned_by, assigned_by_email, assigned_by_name)
      values ($1, $2, $3, $4, $5) on conflict do nothing`, [regs[0], tagId, author.id || null, author.email || '', author.full_name || author.email || '']);
  }
  return { contact_id: contactId, added: add.length, removed: remove.length };
}

module.exports = { listContacts, contactViews, bulkUpdate, getContact, resolveContactId, setContactOwner, setContactTags, phoneNeedle, vnToday };
