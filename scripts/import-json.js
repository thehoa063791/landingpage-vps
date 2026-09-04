#!/usr/bin/env node
// One-time importer: pushes ./data/*.json into the Postgres tables so a fresh
// VPS install picks up existing leads/webhooks/tags/etc. from the old file
// storage. Safe to re-run — every table is upserted on its primary key.
require('dotenv').config();
const fs = require('fs-extra');
const path = require('path');
const { pool } = require('../src/db');

const DATA_DIR = path.join(__dirname, '..', 'data');

const IMPORTERS = [
  { file: 'registrations.json',           fn: importRegistrations },
  { file: 'events.json',                  fn: importEvents },
  { file: 'webhooks.json',                fn: importWebhooks },
  { file: 'payments.json',                fn: importPayments },
  { file: 'crm_tag_categories.json',      fn: importTagCategories },
  { file: 'crm_tags.json',                fn: importTags },
  { file: 'lead_tags.json',               fn: importLeadTags },
  { file: 'crm_custom_fields.json',       fn: importCustomFields },
  { file: 'crm_custom_field_values.json', fn: importCustomFieldValues },
  { file: 'zoom_meetings.json',           fn: importZoomMeetings },
  { file: 'lead_zoom_attendances.json',   fn: importZoomAttendances },
];

async function readJson(name) {
  const p = path.join(DATA_DIR, name);
  if (!(await fs.pathExists(p))) return null;
  const raw = await fs.readJson(p);
  return Array.isArray(raw) ? raw : [];
}

async function main() {
  for (const { file, fn } of IMPORTERS) {
    const rows = await readJson(file);
    if (!rows) { console.log(`⏭  ${file} (not found)`); continue; }
    if (rows.length === 0) { console.log(`⏭  ${file} (empty)`); continue; }
    process.stdout.write(`▶ ${file} (${rows.length} rows) … `);
    try { await fn(rows); console.log('OK'); }
    catch (e) { console.log('FAILED'); console.error(e.message); }
  }
  await pool.end();
}

async function upsert(table, cols, rows, conflict) {
  if (!rows.length) return;
  const chunkSize = 250;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const params = [];
    const values = chunk.map(r => {
      const placeholders = cols.map(c => { params.push(serialize(r[c])); return `$${params.length}`; });
      return `(${placeholders.join(', ')})`;
    }).join(', ');
    const setSql = cols.filter(c => c !== conflict).map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
    const sql =
      `INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(', ')}) VALUES ${values}` +
      ` ON CONFLICT (${conflict.split(',').map(s => `"${s.trim()}"`).join(',')})` +
      (setSql ? ` DO UPDATE SET ${setSql}` : ` DO NOTHING`);
    await pool.query(sql, params);
  }
}

function serialize(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}

async function importRegistrations(rows) {
  const cols = [
    'id','data','name','email','phone','attendance','interest','page_id','region',
    'registered_at','utm_source','utm_medium','utm_campaign','utm_content','utm_term',
    'referrer','ip','ga','fbc','fbp','fbclid','gclid','ttclid','msclkid','twclid',
    'session_id','user_agent','geo','device',
  ];
  const shaped = rows.map(r => ({
    ...pick(r, cols.filter(c => c !== 'data')),
    data: r.data || r,
    name: r.name || '',
    email: r.email || '',
    phone: r.phone || '',
    page_id: r.page_id || 'default',
  }));
  await upsert('registrations', cols, shaped, 'id');
}

async function importEvents(rows) {
  const cols = ['id','data','event','event_timestamp','session_id','ip','page_id','url','referrer',
                'utm_source','utm_medium','utm_campaign','utm_content','utm_term','event_meta'];
  const shaped = rows.map(r => ({
    id: r.id || undefined,
    data: r,
    event: r.event,
    event_timestamp: r.timestamp || r.event_timestamp,
    session_id: r.session_id,
    ip: r.ip,
    page_id: r.data?.page_id || r.page_id,
    url: r.data?.url || r.url,
    referrer: r.data?.referrer || r.referrer,
    utm_source: r.data?.utm_source || r.utm_source,
    utm_medium: r.data?.utm_medium || r.utm_medium,
    utm_campaign: r.data?.utm_campaign || r.utm_campaign,
    utm_content: r.data?.utm_content || r.utm_content,
    utm_term: r.data?.utm_term || r.utm_term,
    event_meta: r.data || null,
  })).filter(r => r.id); // only rows with id — new events get uuid on insert
  await upsert('events', cols, shaped, 'id');
}

async function importWebhooks(rows) {
  const cols = ['id','data','name','url','active','last_triggered','last_status','last_error','last_duration_ms','updated_at'];
  const shaped = rows.map(r => ({ ...pick(r, cols.filter(c => c !== 'data')), data: r }));
  await upsert('webhooks', cols, shaped, 'id');
}

async function importPayments(rows) {
  const cols = ['id','data'];
  const shaped = rows.map(r => ({ id: r.txn_ref || r.id, data: r })).filter(r => r.id);
  await upsert('payments', cols, shaped, 'id');
}

async function importTagCategories(rows) {
  const cols = ['id','name','color'];
  await upsert('crm_tag_categories', cols, rows.map(r => pick(r, cols)), 'id');
}

async function importTags(rows) {
  const cols = ['id','category_id','name','slug','color','description','active'];
  await upsert('crm_tags', cols, rows.map(r => pick(r, cols)), 'id');
}

async function importLeadTags(rows) {
  const cols = ['registration_id','tag_id','assigned_by','assigned_by_email','assigned_by_name','assigned_at'];
  const { rows: userRows } = await pool.query('SELECT id FROM auth_users');
  const validUserIds = new Set(userRows.map(r => r.id));
  const shaped = rows.map(r => {
    const picked = pick(r, cols);
    if (picked.assigned_by && !validUserIds.has(picked.assigned_by)) picked.assigned_by = null;
    return picked;
  });
  await upsert('lead_tags', cols, shaped, 'registration_id,tag_id');
}

async function importCustomFields(rows) {
  const cols = ['id','user_id','label','key','type','required','default_value','group_name','sort_order','options','active'];
  await upsert('crm_custom_fields', cols, rows.map(r => pick(r, cols)), 'id');
}

async function importCustomFieldValues(rows) {
  const cols = ['registration_id','field_id','value','updated_at','updated_by','updated_by_email','updated_by_name'];
  await upsert('crm_custom_field_values', cols, rows.map(r => pick(r, cols)), 'registration_id,field_id');
}

async function importZoomMeetings(rows) {
  const cols = ['zoom_meeting_uuid','zoom_meeting_id','topic','start_time','duration','host_email','host_id','raw'];
  await upsert('zoom_meetings', cols, rows.map(r => pick(r, cols)), 'zoom_meeting_uuid');
}

async function importZoomAttendances(rows) {
  const cols = ['id','registration_id','lead_email','zoom_meeting_uuid','zoom_meeting_id','zoom_display_name','join_time','leave_time','duration','raw'];
  const { rows: meetingRows } = await pool.query('SELECT zoom_meeting_uuid FROM zoom_meetings');
  const validMeetingUuids = new Set(meetingRows.map(r => r.zoom_meeting_uuid));
  const shaped = rows.map(r => pick(r, cols))
    .filter(r => r.id && r.lead_email && r.zoom_meeting_uuid && validMeetingUuids.has(r.zoom_meeting_uuid));
  await upsert('lead_zoom_attendances', cols, shaped, 'id');
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj?.[k];
  return out;
}

main().catch(err => { console.error(err); process.exit(1); });
