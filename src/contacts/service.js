// Contacts layer (roadmap 3.1): keeps public.contacts in line with the registrations, using the
// identity rules of ./identity.js. One algorithm for both uses:
//  - attachRegistration(id): right after a lead is created, re-groups the leads linked to it
//    (same emails/phones, followed through) and writes the result;
//  - syncAll(): re-groups every lead (first build, nightly check by scripts/maintenance.cjs).
// Writing a group keeps the contact its registrations already have; two contacts in one group
// are merged (kept: the one of the earliest registration), a contact split over two groups
// keeps its ID in the first and the others get new contacts. Merges and splits are logged in
// contact_merges. Registrations are never changed apart from contact_id.
const crypto = require('crypto');
const { pool } = require('../db');
const { cluster, emailKey, phoneKey } = require('./identity');

const LOCK = 727001; // one writer at a time (pg_advisory_xact_lock)
const ROW_COLS = 'id, name, email, phone, page_id, registered_at, assigned_to, contact_id, first_touch, last_touch, utm_source, utm_medium, utm_campaign';
const PHONE_KEY_SQL = `(case when regexp_replace(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), '^0084', '84') like '84%' and length(regexp_replace(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), '^0084', '84')) >= 11
  then '0' || substr(regexp_replace(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), '^0084', '84'), 3) else regexp_replace(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), '^0084', '84') end)`;
const iso = value => value ? new Date(value).toISOString() : null;

// Leads linked to these emails/phones through shared emails or phones.
async function loadLinked(client, { emails = [], phones = [] }) {
  const emailSet = new Set(emails.filter(Boolean)), phoneSet = new Set(phones.filter(Boolean));
  const found = new Map();
  for (let round = 0; round < 8 && (emailSet.size || phoneSet.size); round++) {
    const { rows } = await client.query(`select ${ROW_COLS} from public.registrations where lower(email) = any($1) or ${PHONE_KEY_SQL} = any($2)`, [[...emailSet], [...phoneSet]]);
    let grew = false;
    for (const row of rows) {
      if (found.has(row.id)) continue;
      found.set(row.id, row);
      const e = emailKey(row.email), p = phoneKey(row.phone);
      if (e && !emailSet.has(e)) { emailSet.add(e); grew = true; }
      if (p && !phoneSet.has(p)) { phoneSet.add(p); grew = true; }
    }
    if (!grew) break;
  }
  return [...found.values()];
}

// Decisions that override the rules for these registrations: pairs kept apart ("not the same
// person": contact_decisions, and older candidate decisions) and pairs merged by hand.
async function decisionPairs(client, rows) {
  const contactIds = [...new Set(rows.map(r => r.contact_id).filter(Boolean))];
  const regIds = rows.map(r => String(r.id));
  const notSame = new Set(), same = new Set();
  if (regIds.length) {
    const { rows: decided } = await client.query(`select registration_a, registration_b, decision from public.contact_decisions where registration_a = any($1) or registration_b = any($1)`, [regIds]);
    for (const d of decided) (d.decision === 'same' ? same : notSame).add(`${d.registration_a}|${d.registration_b}`);
  }
  if (!contactIds.length) return { notSame, same };
  const { rows: pairs } = await client.query(`select c.contact_a, c.contact_b from public.contact_candidates c where c.status = 'not_same' and (c.contact_a = any($1) or c.contact_b = any($1))`, [contactIds]);
  if (!pairs.length) return { notSame, same };
  const regs = await client.query(`select id, contact_id from public.registrations where contact_id = any($1)`, [[...new Set(pairs.flatMap(r => [r.contact_a, r.contact_b]))]]);
  const byContact = new Map();
  for (const r of regs.rows) { if (!byContact.has(r.contact_id)) byContact.set(r.contact_id, []); byContact.get(r.contact_id).push(r.id); }
  for (const { contact_a, contact_b } of pairs) for (const a of byContact.get(contact_a) || []) for (const b of byContact.get(contact_b) || []) notSame.add(`${a}|${b}`);
  return { notSame, same };
}

// Contact fields from its registrations (oldest first).
function summary(group) {
  const latest = [...group].reverse();
  const touchOf = (row, which) => row[which] || (row.utm_source ? { source: row.utm_source, medium: row.utm_medium || '', campaign: row.utm_campaign || '', at: iso(row.registered_at) } : null);
  const firsts = group.map(row => touchOf(row, 'first_touch')).filter(Boolean).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return {
    display_name: String(latest.find(row => String(row.name || '').trim())?.name || '').trim(),
    primary_email: latest.map(row => emailKey(row.email)).find(Boolean) || '',
    primary_phone: latest.map(row => phoneKey(row.phone)).find(Boolean) || '',
    owner_id: group.find(row => row.assigned_to)?.assigned_to || null,
    first_touch: firsts[0] || null,
    last_touch: latest.map(row => touchOf(row, 'last_touch')).find(Boolean) || null,
    first_registered_at: iso(group[0].registered_at),
    last_registered_at: iso(group.at(-1).registered_at),
    registrations_count: group.length,
  };
}

// Writes the grouping of `rows` (all leads of the affected people). Returns counts.
async function reconcile(client, rows, { by = 'system', reason = 'identity rules' } = {}) {
  const { notSame, same } = await decisionPairs(client, rows);
  const { groups, candidates } = cluster(rows, { notSame, same });
  const used = new Set(), assignments = [], merges = [], splits = [];
  for (const group of groups) {
    const existing = [...new Set(group.map(r => r.contact_id).filter(Boolean))];
    let keep = existing.find(id => !used.has(id)) || null;
    if (!keep) keep = crypto.randomUUID();
    // The registrations that move, so a merge can be undone (contact_merges.details).
    for (const id of existing) if (id !== keep) (used.has(id) ? splits : merges).push({ kept_id: keep, merged_id: id, registration_ids: group.filter(r => r.contact_id === id).map(r => r.id) });
    used.add(keep);
    assignments.push({ id: keep, group, isNew: !existing.includes(keep) });
  }
  // Only contacts whose content can change are written.
  const touched = assignments.filter(a => a.isNew || a.group.some(r => r.contact_id !== a.id) || merges.some(m => m.kept_id === a.id));
  const counts = { contacts_created: 0, contacts_updated: 0, registrations_linked: 0, merged: merges.length, split: splits.length, candidates: 0 };
  if (!touched.length && !candidates.length) return counts;

  const ids = touched.map(a => a.id), sums = touched.map(a => summary(a.group));
  const col = key => sums.map(s => s[key]);
  await client.query(`insert into public.contacts (id, display_name, primary_email, primary_phone, owner_id, first_touch, last_touch, first_registered_at, last_registered_at, registrations_count)
    select * from unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::uuid[], $6::jsonb[], $7::jsonb[], $8::timestamptz[], $9::timestamptz[], $10::int[])
    on conflict (id) do update set display_name = coalesce(public.contacts.pinned->>'display_name', excluded.display_name),
      primary_email = coalesce(public.contacts.pinned->>'primary_email', excluded.primary_email), primary_phone = coalesce(public.contacts.pinned->>'primary_phone', excluded.primary_phone),
      owner_id = coalesce(public.contacts.owner_id, excluded.owner_id), first_touch = excluded.first_touch, last_touch = excluded.last_touch,
      first_registered_at = excluded.first_registered_at, last_registered_at = excluded.last_registered_at, registrations_count = excluded.registrations_count,
      merged_into = null, updated_at = now()`,
    [ids, col('display_name'), col('primary_email'), col('primary_phone'), col('owner_id'), col('first_touch').map(t => t && JSON.stringify(t)), col('last_touch').map(t => t && JSON.stringify(t)), col('first_registered_at'), col('last_registered_at'), col('registrations_count')]);
  counts.contacts_created = touched.filter(a => a.isNew).length;
  counts.contacts_updated = touched.length - counts.contacts_created;

  const regIds = [], regContacts = [];
  for (const a of touched) for (const r of a.group) if (r.contact_id !== a.id) { regIds.push(r.id); regContacts.push(a.id); }
  if (regIds.length) {
    await client.query(`update public.registrations r set contact_id = v.contact_id from unnest($1::text[], $2::uuid[]) as v(id, contact_id) where r.id = v.id`, [regIds, regContacts]);
    counts.registrations_linked = regIds.length;
  }
  if (merges.length) {
    await client.query(`update public.contacts c set merged_into = v.kept, registrations_count = 0, updated_at = now() from unnest($1::uuid[], $2::uuid[]) as v(merged, kept) where c.id = v.merged`, [merges.map(m => m.merged_id), merges.map(m => m.kept_id)]);
    // A merged contact is only a pointer now: its identities move with its registrations.
    await client.query(`delete from public.contact_identities where contact_id = any($1) and kind in ('email', 'phone')`, [merges.map(m => m.merged_id)]);
  }
  for (const [action, list] of [['merge', merges], ['split', splits]]) {
    if (list.length) await client.query(`insert into public.contact_merges (kept_id, merged_id, action, reason, by_email, details) select * from unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::text[], $6::jsonb[])`,
      [list.map(m => m.kept_id), list.map(m => m.merged_id), list.map(() => action), list.map(() => reason), list.map(() => by), list.map(m => JSON.stringify({ registration_ids: m.registration_ids }))]);
  }

  // Identities of the touched contacts, from their registrations.
  await client.query('delete from public.contact_identities where contact_id = any($1) and kind in ($2, $3)', [ids, 'email', 'phone']);
  const kinds = [], values = [], owners = [];
  for (const a of touched) {
    for (const v of new Set(a.group.map(r => emailKey(r.email)).filter(Boolean))) { kinds.push('email'); values.push(v); owners.push(a.id); }
    for (const v of new Set(a.group.map(r => phoneKey(r.phone)).filter(Boolean))) { kinds.push('phone'); values.push(v); owners.push(a.id); }
  }
  if (kinds.length) await client.query(`insert into public.contact_identities (kind, value, contact_id) select * from unnest($1::text[], $2::text[], $3::uuid[]) on conflict do nothing`, [kinds, values, owners]);

  // Possible duplicates among these people: open ones are replaced, decisions are kept.
  const allIds = assignments.map(a => a.id);
  await client.query(`delete from public.contact_candidates where status = 'open' and (contact_a = any($1) or contact_b = any($1))`, [allIds]);
  if (candidates.length) {
    const pairs = candidates.map(c => { const [x, y] = [assignments[c.a].id, assignments[c.b].id].sort(); return [x, y, c.reason, String(c.key || '').slice(0, 200)]; });
    await client.query(`insert into public.contact_candidates (contact_a, contact_b, reason, match_key) select * from unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[]) on conflict do nothing`,
      [pairs.map(p => p[0]), pairs.map(p => p[1]), pairs.map(p => p[2]), pairs.map(p => p[3])]);
    counts.candidates = pairs.length;
  }
  return counts;
}

async function inTransaction(database, fn) {
  const client = await database.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock($1)', [LOCK]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// After a lead is created: links it (and the leads of the same people) to contacts.
async function attachRegistration(registrationId, { database = pool, by = 'system' } = {}) {
  return inTransaction(database, async client => {
    const { rows: [lead] } = await client.query(`select ${ROW_COLS} from public.registrations where id = $1`, [registrationId]);
    if (!lead) return null;
    const linked = await loadLinked(client, { emails: [emailKey(lead.email)], phones: [phoneKey(lead.phone)] });
    if (!linked.some(r => r.id === lead.id)) linked.push(lead);
    // Contacts already holding these leads may have other leads too (manual merges later on).
    await withPeople(client, linked);
    return reconcile(client, linked, { by, reason: 'new registration' });
  });
}

// Adds every registration of the people these rows belong to, and of people joined to them by
// a manual merge, so a regrouping never sees half a person.
async function withPeople(client, rows) {
  for (let round = 0; round < 4; round++) {
    const ids = rows.map(r => String(r.id));
    const contactIds = [...new Set(rows.map(r => r.contact_id).filter(Boolean))];
    const { rows: partners } = await client.query(`select case when registration_a = any($1) then registration_b else registration_a end as id from public.contact_decisions
      where decision = 'same' and (registration_a = any($1) or registration_b = any($1))`, [ids]);
    const { rows: more } = await client.query(`select ${ROW_COLS} from public.registrations where contact_id = any($1) or id = any($2)`, [contactIds, partners.map(p => p.id)]);
    const before = rows.length;
    for (const row of more) if (!rows.some(r => r.id === row.id)) rows.push(row);
    if (rows.length === before) break;
  }
  rows.sort((a, b) => new Date(a.registered_at).getTime() - new Date(b.registered_at).getTime() || String(a.id).localeCompare(String(b.id)));
  return rows;
}

const pairKey = (a, b) => (String(a) < String(b) ? [String(a), String(b)] : [String(b), String(a)]);
async function decide(client, pairs, decision, { reason, by }) {
  if (!pairs.length) return;
  const keys = pairs.map(([a, b]) => pairKey(a, b));
  await client.query(`insert into public.contact_decisions (registration_a, registration_b, decision, reason, by_email)
    select a, b, $3, $4, $5 from unnest($1::text[], $2::text[]) as v(a, b)
    on conflict (registration_a, registration_b) do update set decision = excluded.decision, reason = excluded.reason, by_email = excluded.by_email, created_at = now()`,
    [keys.map(k => k[0]), keys.map(k => k[1]), decision, reason, by]);
}
const regsOf = async (client, contactId) => (await client.query(`select ${ROW_COLS} from public.registrations where contact_id = $1 order by registered_at, id`, [contactId])).rows;
const MAX_PAIRS = 2500;
const crossPairs = (left, right) => left.flatMap(a => right.map(b => [a.id, b.id])).slice(0, MAX_PAIRS);
const sorted = ([a, b]) => (String(a) < String(b) ? [a, b] : [b, a]);

/**
 * Review of a possible duplicate (roadmap 3.3).
 * decision 'same': the two people become one; pins { display_name, primary_email, primary_phone }
 * are the values chosen on screen. 'not_same': they stay apart for good.
 */
async function decidePair(contactA, contactB, decision, { by = '', pins = {}, database = pool } = {}) {
  if (!['same', 'not_same'].includes(decision) || !contactA || !contactB || contactA === contactB) throw Object.assign(new Error('Invalid decision'), { status: 400 });
  return inTransaction(database, async client => {
    const [left, right] = [await regsOf(client, contactA), await regsOf(client, contactB)];
    if (!left.length || !right.length) throw Object.assign(new Error('Hồ sơ không còn tồn tại hoặc đã được gộp.'), { status: 409 });
    const cross = crossPairs(left, right).map(([a, b]) => pairKey(a, b));
    // The new decision replaces older ones between these two people.
    await client.query(`delete from public.contact_decisions where (registration_a, registration_b) in (select * from unnest($1::text[], $2::text[]))`, [cross.map(k => k[0]), cross.map(k => k[1])]);
    if (decision === 'same') await decide(client, [[left[0].id, right[0].id]], 'same', { reason: 'manual merge', by });
    else await decide(client, cross, 'not_same', { reason: 'not the same person', by });
    const [x, y] = sorted([contactA, contactB]);
    await client.query(`update public.contact_candidates set status = $3, decided_by = $4, decided_at = now() where contact_a = $1 and contact_b = $2`, [x, y, decision === 'same' ? 'merged' : 'not_same', by]);
    const rows = await withPeople(client, [...left, ...right]);
    const counts = await reconcile(client, rows, { by, reason: decision === 'same' ? 'manual merge' : 'not the same person' });
    const kept = (await client.query('select contact_id from public.registrations where id = $1', [left[0].id])).rows[0].contact_id;
    const pin = Object.fromEntries(Object.entries(pins || {}).filter(([k, v]) => ['display_name', 'primary_email', 'primary_phone'].includes(k) && typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim().slice(0, 200)]));
    if (decision === 'same' && Object.keys(pin).length) {
      await client.query(`update public.contacts set pinned = pinned || $2::jsonb, display_name = coalesce($2::jsonb->>'display_name', display_name),
        primary_email = coalesce($2::jsonb->>'primary_email', primary_email), primary_phone = coalesce($2::jsonb->>'primary_phone', primary_phone), updated_at = now() where id = $1`, [kept, JSON.stringify(pin)]);
    }
    return { ...counts, contact_id: kept };
  });
}

// Moves some registrations of a person to a new person (also: undo a merge). They stay apart.
async function splitContact(contactId, registrationIds, { by = '', reason = 'manual split', database = pool } = {}) {
  return inTransaction(database, async client => {
    const regs = await regsOf(client, contactId);
    const moving = new Set((registrationIds || []).map(String));
    const out = regs.filter(r => moving.has(String(r.id))), stay = regs.filter(r => !moving.has(String(r.id)));
    if (!out.length || !stay.length) throw Object.assign(new Error('Chọn một phần các lượt đăng ký để tách.'), { status: 400 });
    const cross = crossPairs(out, stay).map(([a, b]) => pairKey(a, b));
    await client.query(`delete from public.contact_decisions where decision = 'same' and (registration_a, registration_b) in (select * from unnest($1::text[], $2::text[]))`, [cross.map(k => k[0]), cross.map(k => k[1])]);
    // A manual merge may join them through another pair: drop every 'same' between the two sides.
    await client.query(`delete from public.contact_decisions where decision = 'same' and ((registration_a = any($1) and registration_b = any($2)) or (registration_a = any($2) and registration_b = any($1)))`, [out.map(r => String(r.id)), stay.map(r => String(r.id))]);
    await decide(client, cross, 'not_same', { reason, by });
    // The pinned name/email/phone came from a merge; the remaining person recomputes them.
    const rest = summary(stay);
    await client.query(`update public.contacts set pinned = '{}'::jsonb, display_name = $2, primary_email = $3, primary_phone = $4 where id = $1`, [contactId, rest.display_name, rest.primary_email, rest.primary_phone]);
    const counts = await reconcile(client, await withPeople(client, regs.map(r => ({ ...r }))), { by, reason });
    const newId = (await client.query('select contact_id from public.registrations where id = $1', [out[0].id])).rows[0].contact_id;
    return { ...counts, contact_id: contactId, new_contact_id: newId };
  });
}


// Every lead (first build, nightly check). `apply: false` computes without writing.
async function syncAll({ database = pool, apply = true } = {}) {
  return inTransaction(database, async client => {
    const { rows } = await client.query(`select ${ROW_COLS} from public.registrations order by registered_at, id`);
    const counts = await reconcile(client, rows, { reason: 'sync' });
    if (!apply) throw Object.assign(new Error('dry run'), { dryRun: true, counts });
    return counts;
  }).catch(error => { if (error.dryRun) return { ...error.counts, dry_run: true }; throw error; });
}

// ── Before and after a registration (roadmap 3.4) ────────────────────────────

// The person an incoming form belongs to, by the same rules and decisions as the grouping:
// { contact_id, owner_id, registrations: [{ id, page_id, email }] }, or null for someone new.
async function matchPerson({ name = '', email = '', phone = '' } = {}, { database = pool } = {}) {
  const e = emailKey(email), p = phoneKey(phone);
  if (!e && !p) return null;
  const linked = await loadLinked(database, { emails: e ? [e] : [], phones: p ? [p] : [] });
  if (!linked.length) return null;
  await withPeople(database, linked);
  const incoming = { id: '__incoming__', name, email, phone, registered_at: new Date(), contact_id: null };
  const { notSame, same } = await decisionPairs(database, linked);
  const { groups } = cluster([...linked, incoming], { notSame, same });
  const others = (groups.find(group => group.includes(incoming)) || []).filter(row => row !== incoming);
  if (!others.length) return null;
  const contactId = others.find(row => row.contact_id)?.contact_id || null;
  const owner = contactId ? (await database.query('select owner_id from public.contacts where id = $1', [contactId])).rows[0]?.owner_id : null;
  return {
    contact_id: contactId,
    owner_id: owner || others.find(row => row.assigned_to)?.assigned_to || null,
    registrations: others.map(row => ({ id: row.id, page_id: row.page_id, email: row.email })),
  };
}

// Webhook fields of a stored registration: its person and whether the person, or this funnel
// for the person, is new. funnelOf maps a page ID to its funnel (variants of one funnel count once).
async function personFlags(registrationId, { funnelOf = id => id, database = pool } = {}) {
  const { rows: [reg] } = await database.query('select id, contact_id, page_id, registered_at from public.registrations where id = $1', [registrationId]);
  if (!reg?.contact_id) return {};
  const { rows } = await database.query(`select id, page_id from public.registrations where contact_id = $1 and id <> $2 and (registered_at < $3 or (registered_at = $3 and id < $2))`, [reg.contact_id, reg.id, reg.registered_at]);
  return {
    contact_id: reg.contact_id,
    is_new_contact: rows.length === 0,
    is_new_funnel: !rows.some(row => funnelOf(row.page_id) === funnelOf(reg.page_id)),
  };
}

module.exports = { attachRegistration, syncAll, reconcile, summary, decidePair, splitContact, matchPerson, personFlags };
