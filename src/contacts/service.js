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

// Registration pairs that must stay apart: candidates marked "not the same person".
async function notSamePairs(client, contactIds) {
  if (!contactIds.length) return new Set();
  const { rows } = await client.query(`select c.contact_a, c.contact_b from public.contact_candidates c where c.status = 'not_same' and (c.contact_a = any($1) or c.contact_b = any($1))`, [contactIds]);
  if (!rows.length) return new Set();
  const regs = await client.query(`select id, contact_id from public.registrations where contact_id = any($1)`, [[...new Set(rows.flatMap(r => [r.contact_a, r.contact_b]))]]);
  const byContact = new Map();
  for (const r of regs.rows) { if (!byContact.has(r.contact_id)) byContact.set(r.contact_id, []); byContact.get(r.contact_id).push(r.id); }
  const out = new Set();
  for (const { contact_a, contact_b } of rows) for (const a of byContact.get(contact_a) || []) for (const b of byContact.get(contact_b) || []) out.add(`${a}|${b}`);
  return out;
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
  const notSame = await notSamePairs(client, [...new Set(rows.map(r => r.contact_id).filter(Boolean))]);
  const { groups, candidates } = cluster(rows, { notSame });
  const used = new Set(), assignments = [], merges = [], splits = [];
  for (const group of groups) {
    const existing = [...new Set(group.map(r => r.contact_id).filter(Boolean))];
    let keep = existing.find(id => !used.has(id)) || null;
    if (!keep) keep = crypto.randomUUID();
    for (const id of existing) if (id !== keep) (used.has(id) ? splits : merges).push({ kept_id: keep, merged_id: id });
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
    on conflict (id) do update set display_name = excluded.display_name, primary_email = excluded.primary_email, primary_phone = excluded.primary_phone,
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
    if (list.length) await client.query(`insert into public.contact_merges (kept_id, merged_id, action, reason, by_email) select * from unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::text[])`,
      [list.map(m => m.kept_id), list.map(m => m.merged_id), list.map(() => action), list.map(() => reason), list.map(() => by)]);
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
    const contactIds = [...new Set(linked.map(r => r.contact_id).filter(Boolean))];
    if (contactIds.length) {
      const { rows } = await client.query(`select ${ROW_COLS} from public.registrations where contact_id = any($1)`, [contactIds]);
      for (const row of rows) if (!linked.some(r => r.id === row.id)) linked.push(row);
    }
    linked.sort((a, b) => new Date(a.registered_at).getTime() - new Date(b.registered_at).getTime() || String(a.id).localeCompare(String(b.id)));
    return reconcile(client, linked, { by, reason: 'new registration' });
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

module.exports = { attachRegistration, syncAll, reconcile, summary };
