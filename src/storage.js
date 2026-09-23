require('dotenv').config();
const path = require('path');
const fs = require('fs-extra');
const { supabase } = require('./db');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = {
  registrations: path.join(DATA_DIR, 'registrations.json'),
  events:        path.join(DATA_DIR, 'events.json'),
  webhooks:      path.join(DATA_DIR, 'webhooks.json'),
  payments:      path.join(DATA_DIR, 'payments.json'),
  funnelSales:   path.join(DATA_DIR, 'funnel_sales.json'),
  crmProfiles:   path.join(DATA_DIR, 'crm_profiles.json'),
  leadNotes:     path.join(DATA_DIR, 'lead_notes.json'),
  crmSettings:   path.join(DATA_DIR, 'crm_settings.json'),
  customFields:  path.join(DATA_DIR, 'crm_custom_fields.json'),
  customFieldValues: path.join(DATA_DIR, 'crm_custom_field_values.json'),
  crmTagCategories: path.join(DATA_DIR, 'crm_tag_categories.json'),
  crmTags:       path.join(DATA_DIR, 'crm_tags.json'),
  leadTags:      path.join(DATA_DIR, 'lead_tags.json'),
  zoomMeetings:  path.join(DATA_DIR, 'zoom_meetings.json'),
  leadZoomAttendances: path.join(DATA_DIR, 'lead_zoom_attendances.json'),
  surveys:       path.join(DATA_DIR, 'surveys.json'),
};

// Postgres is the primary store; JSON files remain as an emergency fallback.
// `checkSupabase()` keeps the same name so callers don't change — it now
// probes the Postgres connection and caches the result for a few minutes.
let _dbOk = null;

async function checkSupabase() {
  if (_dbOk !== null) return _dbOk;
  try {
    const { error } = await supabase.from('registrations').select('id').limit(1);
    _dbOk = !error;
  } catch { _dbOk = false; }
  if (!_dbOk) console.warn('[storage] Postgres unavailable – using local JSON files');
  return _dbOk;
}

setInterval(() => { _dbOk = null; }, 5 * 60 * 1000);

async function fileRead(name) {
  try { return await fs.readJson(FILE[name]); } catch { return []; }
}
async function fileWrite(name, arr) {
  await fs.ensureDir(DATA_DIR);
  await fs.writeJson(FILE[name], arr, { spaces: 2 });
}

// ── In-memory TTL cache ───────────────────────────────────────────────────────
const _cache = {};
function cacheGet(key) {
  const e = _cache[key];
  if (!e) return null;
  if (Date.now() > e.exp) { delete _cache[key]; return null; }
  return e.val;
}
function cacheSet(key, val, ttlMs) { _cache[key] = { val, exp: Date.now() + ttlMs }; }
function cacheInvalidate(key) { delete _cache[key]; }

const TTL = { registrations: 45_000, events: 30_000 };

function isMissingTableError(error) {
  const msg = String(error?.message || '');
  return error?.code === '42P01' || /Could not find the table|schema cache|does not exist/i.test(msg);
}

// ── Parallel paginated fetch ──────────────────────────────────────────────────
const REG_COLS_BASE = 'id,name,email,phone,attendance,interest,page_id,region,registered_at,utm_source,utm_medium,utm_campaign,utm_content,utm_term,referrer,ip,ga,fbc,fbp,fbclid,gclid,ttclid,session_id,user_agent,geo,device,assigned_to,assigned_at';
const REG_COLS = `${REG_COLS_BASE},last_interaction_at`;
const EVT_COLS = 'id,event,event_timestamp,session_id,ip,page_id,url,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,event_meta';

const TABLE_COLS  = { registrations: REG_COLS, events: EVT_COLS };
const TABLE_ORDER = { registrations: 'registered_at', events: 'event_timestamp' };

function rowToRecord(table, r) {
  if (table === 'registrations') {
    return {
      id: r.id, name: r.name, email: r.email, phone: r.phone,
      attendance: r.attendance, interest: r.interest || '', page_id: r.page_id, region: r.region,
      registered_at: r.registered_at,
      utm_source: r.utm_source, utm_medium: r.utm_medium,
      utm_campaign: r.utm_campaign, utm_content: r.utm_content, utm_term: r.utm_term,
      referrer: r.referrer, ip: r.ip, ga: r.ga,
      fbc: r.fbc, fbp: r.fbp, fbclid: r.fbclid, gclid: r.gclid, ttclid: r.ttclid,
      msclkid: r.msclkid || '', twclid: r.twclid || '',
      session_id: r.session_id, user_agent: r.user_agent,
      geo: r.geo, device: r.device,
      assigned_to: r.assigned_to || '',
      assigned_at: r.assigned_at || null,
      last_interaction_at: r.last_interaction_at || null,
    };
  }
  if (table === 'events') {
    return {
      id: r.id, event: r.event,
      timestamp: r.event_timestamp,
      session_id: r.session_id, ip: r.ip,
      data: { page_id: r.page_id, url: r.url, referrer: r.referrer,
              utm_source: r.utm_source, utm_medium: r.utm_medium,
              utm_campaign: r.utm_campaign, utm_content: r.utm_content,
              utm_term: r.utm_term, ...r.event_meta },
    };
  }
  return r.data;
}

async function fetchAllRows(table) {
  try {
    const PAGE = 1000;
    const cols = TABLE_COLS[table] || 'data';

    const { count, error: countErr } = await supabase
      .from(table).select('*', { count: 'exact', head: true });
    if (countErr || count === null) return null;
    if (count === 0) return [];

    const orderCol = TABLE_ORDER[table] || 'created_at';
    const numPages = Math.ceil(count / PAGE);
    let selectCols = cols;
    let requests = Array.from({ length: numPages }, (_, i) =>
      supabase.from(table).select(selectCols)
        .order(orderCol, { ascending: true })
        .range(i * PAGE, i * PAGE + PAGE - 1)
    );
    let results = await Promise.all(requests);

    if (table === 'registrations' && results.some(r => r.error) && selectCols.includes('last_interaction_at')) {
      console.warn('[fetchAllRows] registrations.last_interaction_at is unavailable; retrying with base CRM columns.');
      selectCols = REG_COLS_BASE;
      requests = Array.from({ length: numPages }, (_, i) =>
        supabase.from(table).select(selectCols)
          .order(orderCol, { ascending: true })
          .range(i * PAGE, i * PAGE + PAGE - 1)
      );
      results = await Promise.all(requests);
    }

    const rows = [];
    for (const { data, error } of results) {
      if (error || !data) {
        console.error(`[fetchAllRows] ${table} page error:`, JSON.stringify(error));
        return null;
      }
      rows.push(...data);
    }
    return rows.map(r => TABLE_COLS[table] ? rowToRecord(table, r) : r.data);
  } catch (e) {
    console.warn(`[fetchAllRows] ${table} unavailable:`, e.message);
    return null;
  }
}

// ── Registrations ─────────────────────────────────────────────────────────────

async function getRegistrations() {
  const cached = cacheGet('registrations');
  if (cached) return cached;
  let rows;
  if (await checkSupabase()) {
    rows = await fetchAllRows('registrations');
  }
  if (!rows) rows = await fileRead('registrations');
  cacheSet('registrations', rows, TTL.registrations);
  return rows;
}

async function getRegistrationById(id) {
  if (await checkSupabase()) {
    let { data, error } = await supabase.from('registrations').select(REG_COLS).eq('id', id).single();
    if (error && /last_interaction_at/i.test(error.message || '')) {
      ({ data, error } = await supabase.from('registrations').select(REG_COLS_BASE).eq('id', id).single());
    }
    if (!error && data) return rowToRecord('registrations', data);
  }
  const arr = await fileRead('registrations');
  return arr.find(r => r.id === id) || null;
}

function normalizeContactPhoneKey(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0084')) digits = digits.slice(2);
  if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

async function findRegistrationByContact({ email = '', phone = '' } = {}) {
  const emailClean = String(email || '').trim().toLowerCase();
  const phoneKey = normalizeContactPhoneKey(phone);
  if (!emailClean && !phoneKey) return null;

  if (await checkSupabase()) {
    const matches = [];
    if (emailClean) {
      let { data, error } = await supabase
        .from('registrations')
        .select(REG_COLS)
        .ilike('email', emailClean)
        .order('registered_at', { ascending: true })
        .limit(5);
      if (error && /last_interaction_at/i.test(error.message || '')) {
        ({ data, error } = await supabase
          .from('registrations')
          .select(REG_COLS_BASE)
          .ilike('email', emailClean)
          .order('registered_at', { ascending: true })
          .limit(5));
      }
      if (!error) matches.push(...(data || []).map(r => rowToRecord('registrations', r)));
      else console.warn('[findRegistrationByContact email]', error.message);
    }

    if (phoneKey) {
      let { data, error } = await supabase
        .from('registrations')
        .select(REG_COLS)
        .eq('phone', phoneKey)
        .order('registered_at', { ascending: true })
        .limit(5);
      if (error && /last_interaction_at/i.test(error.message || '')) {
        ({ data, error } = await supabase
          .from('registrations')
          .select(REG_COLS_BASE)
          .eq('phone', phoneKey)
          .order('registered_at', { ascending: true })
          .limit(5));
      }
      if (!error) matches.push(...(data || []).map(r => rowToRecord('registrations', r)));
      else console.warn('[findRegistrationByContact phone]', error.message);
    }

    const found = matches.find(r => {
      const rPhone = normalizeContactPhoneKey(r.phone);
      const rEmail = String(r.email || '').trim().toLowerCase();
      return (phoneKey && rPhone === phoneKey) || (emailClean && rEmail === emailClean);
    });
    if (found) return found;
  }

  const registrations = await getRegistrations();
  return registrations.find(r => {
    const rPhone = normalizeContactPhoneKey(r.phone);
    const rEmail = String(r.email || '').trim().toLowerCase();
    return (phoneKey && rPhone === phoneKey) || (emailClean && rEmail === emailClean);
  }) || null;
}

async function countRegistrationsByPage(pageId = 'default') {
  const normalizedPageId = String(pageId || 'default');
  if (await checkSupabase()) {
    const { count, error } = await supabase
      .from('registrations')
      .select('id', { count: 'exact', head: true })
      .eq('page_id', normalizedPageId);
    if (!error && count !== null) return count;
    console.warn('[countRegistrationsByPage]', error?.message || 'unknown error');
  }
  const registrations = await getRegistrations();
  return registrations.filter(r => (r.page_id || 'default') === normalizedPageId).length;
}

function compactObject(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

function buildRegistrationFormEntry(record = {}, meta = {}) {
  return compactObject({
    id: meta.id || crypto.randomUUID(),
    source: meta.source || 'web_form',
    merged_from_id: meta.merged_from_id || '',
    submitted_at: record.registered_at || meta.submitted_at || new Date().toISOString(),
    captured_at: meta.captured_at || new Date().toISOString(),
    name: record.name || '',
    phone: record.phone || '',
    email: record.email || '',
    page_id: record.page_id || 'default',
    region: record.region || '',
    interest: record.interest || '',
    attendance: record.attendance || '',
    utm_source: record.utm_source || '',
    utm_medium: record.utm_medium || '',
    utm_campaign: record.utm_campaign || '',
    utm_content: record.utm_content || '',
    utm_term: record.utm_term || '',
    referrer: record.referrer || '',
    event_source_url: record.event_source_url || record.url || '',
    session_id: record.session_id || '',
    fbclid: record.fbclid || '',
    gclid: record.gclid || '',
    ttclid: record.ttclid || '',
    msclkid: record.msclkid || '',
    twclid: record.twclid || '',
    fbc: record.fbc || '',
    fbp: record.fbp || '',
    ga: record.ga || '',
    ip: record.ip || '',
    user_agent: record.user_agent || '',
    city: record.city || record.geo?.city || '',
    state: record.state || record.geo?.region || '',
    country: record.country || record.geo?.country || '',
    webinar: record.webinar || undefined,
    raw: meta.include_raw ? record : undefined,
  });
}

function mergeRegistrationDataForms(existingData = {}, forms = []) {
  const current = existingData && typeof existingData === 'object' ? existingData : {};
  const existingForms = Array.isArray(current.registration_forms) ? current.registration_forms : [];
  const allForms = [...existingForms, ...forms].filter(Boolean);
  const seen = new Set();
  const registrationForms = [];
  for (const form of allForms) {
    const key = [
      form.merged_from_id || '',
      form.submitted_at || '',
      form.page_id || '',
      form.email || '',
      form.phone || '',
      form.session_id || '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    registrationForms.push(form);
  }
  registrationForms.sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
  return { ...current, registration_forms: registrationForms };
}

async function getRegistrationData(id) {
  if (await checkSupabase()) {
    const { data, error } = await supabase.from('registrations').select('data').eq('id', id).single();
    if (!error) return data?.data || {};
    if (error?.code !== 'PGRST116') console.warn('[getRegistrationData]', error.message);
  }
  const arr = await fileRead('registrations');
  const row = arr.find(r => r.id === id);
  return row?.data || row || {};
}

async function insertRegistration(record) {
  cacheInvalidate('registrations');
  if (!record.assigned_to) {
    const assignee = await pickNextSaleAssignee().catch(() => null);
    if (assignee?.user_id) {
      record.assigned_to = assignee.user_id;
      record.assigned_at = new Date().toISOString();
      record.assigned_profile = assignee;
    }
  }
  if (await checkSupabase()) {
    const storedData = mergeRegistrationDataForms(record, [
      buildRegistrationFormEntry(record, { source: 'initial_registration', submitted_at: record.registered_at }),
    ]);
    const payload = {
      id:            record.id,
      data:          storedData,
      name:          record.name,
      email:         record.email,
      phone:         record.phone,
      attendance:    record.attendance,
      page_id:       record.page_id,
      region:        record.region,
      registered_at: record.registered_at,
      utm_source:    record.utm_source,
      utm_medium:    record.utm_medium,
      utm_campaign:  record.utm_campaign,
      utm_content:   record.utm_content,
      utm_term:      record.utm_term,
      referrer:      record.referrer,
      ip:            record.ip,
      ga:            record.ga,
      fbc:           record.fbc,
      fbp:           record.fbp,
      fbclid:        record.fbclid,
      gclid:         record.gclid,
      ttclid:        record.ttclid,
      session_id:    record.session_id,
      user_agent:    record.user_agent,
      geo:           record.geo   || null,
      device:        record.device || null,
    };
    if (record.assigned_to) {
      payload.assigned_to = record.assigned_to;
      payload.assigned_at = record.assigned_at || new Date().toISOString();
    }
    const { error } = await supabase.from('registrations').insert(payload);
    if (!error) return;
    console.error('[insertRegistration] Supabase error:', JSON.stringify(error));
  }
  const arr = await fileRead('registrations');
  const storedRecord = {
    ...record,
    data: mergeRegistrationDataForms(record.data || record, [
      buildRegistrationFormEntry(record, { source: 'initial_registration', submitted_at: record.registered_at }),
    ]),
  };
  arr.push(storedRecord);
  await fileWrite('registrations', arr);
}

async function appendRegistrationForm(registrationId, formRecord, options = {}) {
  cacheInvalidate('registrations');
  const entry = buildRegistrationFormEntry(formRecord, options);
  const currentData = await getRegistrationData(registrationId);
  const data = mergeRegistrationDataForms(currentData, [entry]);
  const latestPatch = options.update_latest === false ? {} : compactObject({
    data,
    name: formRecord.name || undefined,
    email: formRecord.email || undefined,
    phone: formRecord.phone || undefined,
    attendance: formRecord.attendance || undefined,
    page_id: formRecord.page_id || undefined,
    region: formRecord.region || undefined,
    utm_source: formRecord.utm_source || undefined,
    utm_medium: formRecord.utm_medium || undefined,
    utm_campaign: formRecord.utm_campaign || undefined,
    utm_content: formRecord.utm_content || undefined,
    utm_term: formRecord.utm_term || undefined,
    referrer: formRecord.referrer || undefined,
    ip: formRecord.ip || undefined,
    ga: formRecord.ga || undefined,
    fbc: formRecord.fbc || undefined,
    fbp: formRecord.fbp || undefined,
    fbclid: formRecord.fbclid || undefined,
    gclid: formRecord.gclid || undefined,
    ttclid: formRecord.ttclid || undefined,
    session_id: formRecord.session_id || undefined,
    user_agent: formRecord.user_agent || undefined,
    geo: formRecord.geo || undefined,
    device: formRecord.device || undefined,
    registered_at: formRecord.registered_at || options.submitted_at || undefined,
    last_interaction_at: options.last_interaction_at || new Date().toISOString(),
  });
  if (options.update_latest === false) latestPatch.data = data;
  await updateRegistration(registrationId, latestPatch);
  return { data, entry };
}

async function updateRegistration(id, updates) {
  cacheInvalidate('registrations');
  if (await checkSupabase()) {
    const { error } = await supabase.from('registrations').update(updates).eq('id', id);
    if (!error) return;
    console.error('[updateRegistration] Supabase error:', JSON.stringify(error));
  }
  const arr = await fileRead('registrations');
  const idx = arr.findIndex(r => r.id === id);
  if (idx !== -1) { arr[idx] = { ...arr[idx], ...updates }; await fileWrite('registrations', arr); }
}

async function mergeRegistrations(primaryId, duplicateId, options = {}) {
  if (!primaryId || !duplicateId || primaryId === duplicateId) {
    const err = new Error('Invalid lead merge target.');
    err.status = 400;
    throw err;
  }
  cacheInvalidate('registrations');
  const [primary, duplicate] = await Promise.all([
    getRegistrationById(primaryId),
    getRegistrationById(duplicateId),
  ]);
  if (!primary || !duplicate) {
    const err = new Error('Lead not found.');
    err.status = 404;
    throw err;
  }

  const now = new Date().toISOString();
  const primaryData = await getRegistrationData(primaryId);
  const duplicateData = await getRegistrationData(duplicateId);
  const duplicateForms = Array.isArray(duplicateData.registration_forms) ? duplicateData.registration_forms : [];
  const data = mergeRegistrationDataForms(primaryData, [
    buildRegistrationFormEntry(duplicate, { source: 'manual_merge', merged_from_id: duplicateId, include_raw: true, captured_at: now }),
    ...duplicateForms.map(form => ({ ...form, merged_from_id: form.merged_from_id || duplicateId })),
  ]);

  const mergedFields = options.merged_fields || {};
  const fieldPatch = compactObject({
    name: mergedFields.name,
    phone: mergedFields.phone,
    email: mergedFields.email,
    page_id: mergedFields.page_id,
    region: mergedFields.region,
    attendance: mergedFields.attendance,
    utm_source: mergedFields.utm_source || mergedFields.source,
    utm_medium: mergedFields.utm_medium || mergedFields.medium,
    utm_campaign: mergedFields.utm_campaign || mergedFields.campaign,
  });
  await updateRegistration(primaryId, { ...fieldPatch, data, last_interaction_at: now });

  if (await checkSupabase()) {
    await supabase.from('lead_notes').update({ registration_id: primaryId }).eq('registration_id', duplicateId);

    const [{ data: primaryTags }, { data: duplicateTags }] = await Promise.all([
      supabase.from('lead_tags').select('*').eq('registration_id', primaryId),
      supabase.from('lead_tags').select('*').eq('registration_id', duplicateId),
    ]);
    const primaryTagIds = new Set((primaryTags || []).map(t => t.tag_id));
    const tagsToInsert = (duplicateTags || [])
      .filter(t => !primaryTagIds.has(t.tag_id))
      .map(t => ({ ...t, registration_id: primaryId }));
    if (tagsToInsert.length) await supabase.from('lead_tags').insert(tagsToInsert);
    await supabase.from('lead_tags').delete().eq('registration_id', duplicateId);

    const [{ data: primaryValues }, { data: duplicateValues }] = await Promise.all([
      supabase.from('crm_custom_field_values').select('*').eq('registration_id', primaryId),
      supabase.from('crm_custom_field_values').select('*').eq('registration_id', duplicateId),
    ]);
    const primaryFieldIds = new Set((primaryValues || []).map(v => v.field_id));
    const valuesToInsert = (duplicateValues || [])
      .filter(v => !primaryFieldIds.has(v.field_id))
      .map(v => ({ ...v, registration_id: primaryId }));
    if (valuesToInsert.length) await supabase.from('crm_custom_field_values').insert(valuesToInsert);
    await supabase.from('crm_custom_field_values').delete().eq('registration_id', duplicateId);

    await supabase.from('lead_zoom_attendances').update({ registration_id: primaryId, updated_at: now }).eq('registration_id', duplicateId);
    await supabase.from('surveys').update({ registration_id: primaryId }).eq('registration_id', duplicateId);
  } else {
    const notes = await fileRead('leadNotes');
    await fileWrite('leadNotes', notes.map(n => n.registration_id === duplicateId ? { ...n, registration_id: primaryId } : n));

    const tags = await fileRead('leadTags');
    const existing = new Set(tags.filter(t => t.registration_id === primaryId).map(t => t.tag_id));
    const mergedTags = tags
      .filter(t => t.registration_id !== duplicateId)
      .concat(tags
        .filter(t => t.registration_id === duplicateId && !existing.has(t.tag_id))
        .map(t => ({ ...t, registration_id: primaryId })));
    await fileWrite('leadTags', mergedTags);

    const values = await fileRead('customFieldValues');
    const existingFields = new Set(values.filter(v => v.registration_id === primaryId).map(v => v.field_id));
    const mergedValues = values
      .filter(v => v.registration_id !== duplicateId)
      .concat(values
        .filter(v => v.registration_id === duplicateId && !existingFields.has(v.field_id))
        .map(v => ({ ...v, registration_id: primaryId })));
    await fileWrite('customFieldValues', mergedValues);

    const zoomRows = await fileRead('leadZoomAttendances');
    await fileWrite('leadZoomAttendances', zoomRows.map(r => r.registration_id === duplicateId ? { ...r, registration_id: primaryId, updated_at: now } : r));
  }

  await addLeadNote(
    primaryId,
    `Da merge lead ${duplicate.name || duplicate.email || duplicate.phone || duplicateId} (${duplicateId}) vao lead nay. Ly do: ${options.reason || 'duplicate lead'}.`,
    options.author,
    'note'
  );
  await deleteRegistration(duplicateId);
  return { primary_id: primaryId, duplicate_id: duplicateId, merged_at: now };
}

async function deleteRegistration(id) {
  cacheInvalidate('registrations');
  if (await checkSupabase()) {
    await supabase.from('lead_notes').delete().eq('registration_id', id);
    await supabase.from('lead_tags').delete().eq('registration_id', id);
    await supabase.from('lead_zoom_attendances').update({ registration_id: null }).eq('registration_id', id);
    const { error } = await supabase.from('registrations').delete().eq('id', id);
    if (!error) return;
  }
  const regs = await fileRead('registrations');
  await fileWrite('registrations', regs.filter(r => r.id !== id));
  const notes = await fileRead('leadNotes');
  await fileWrite('leadNotes', notes.filter(n => n.registration_id !== id));
  const tags = await fileRead('leadTags');
  await fileWrite('leadTags', tags.filter(t => t.registration_id !== id));
  const zoomRows = await fileRead('leadZoomAttendances');
  await fileWrite('leadZoomAttendances', zoomRows.map(r => r.registration_id === id ? { ...r, registration_id: null } : r));
}

// ── CRM profiles & lead notes ────────────────────────────────────────────────

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function mapZoomMeeting(r) {
  return {
    zoom_meeting_uuid: r.zoom_meeting_uuid || r.uuid || '',
    zoom_meeting_id: String(r.zoom_meeting_id || r.id || ''),
    topic: r.topic || '',
    start_time: r.start_time || null,
    duration: Number(r.duration || 0),
    host_email: r.host_email || '',
    host_id: r.host_id || '',
    raw: r.raw || null,
    updated_at: r.updated_at || null,
    created_at: r.created_at || null,
  };
}

function mapLeadZoomAttendance(r) {
  const raw = r.raw || {};
  return {
    id: r.id,
    registration_id: r.registration_id || null,
    lead_email: normalizeEmail(r.lead_email || r.email),
    lead_phone: r.lead_phone || r.phone || phoneFromZoomRaw(raw),
    zoom_meeting_uuid: r.zoom_meeting_uuid || '',
    zoom_meeting_id: String(r.zoom_meeting_id || ''),
    zoom_display_name: r.zoom_display_name || r.name || '',
    join_time: r.join_time || null,
    leave_time: r.leave_time || null,
    duration: Number(r.duration || 0),
    raw: r.raw || null,
    created_at: r.created_at || null,
    updated_at: r.updated_at || null,
  };
}

function phoneFromZoomRaw(raw = {}) {
  const registrant = raw.registrant || {};
  return String(
    raw.phone ||
    raw.phone_number ||
    raw.user_phone ||
    raw.registrant_phone ||
    raw.mobile ||
    raw.mobile_phone ||
    raw.phoneNumber ||
    registrant.phone ||
    registrant.phone_number ||
    registrant.mobile ||
    registrant.mobile_phone ||
    ''
  ).trim();
}

function indexZoomRegistrantsByEmail(registrants = []) {
  const byEmail = new Map();
  for (const registrant of registrants || []) {
    const email = normalizeEmail(registrant.email || registrant.user_email);
    if (email && !byEmail.has(email)) byEmail.set(email, registrant);
  }
  return byEmail;
}

function dateKey(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function dedupeLeadZoomAttendances(rows = []) {
  const bestByKey = new Map();
  for (const row of rows) {
    const meeting = row.meeting || {};
    const key = [
      normalizeEmail(row.lead_email),
      String(row.zoom_meeting_id || meeting.zoom_meeting_id || row.zoom_meeting_uuid || ''),
      dateKey(meeting.start_time || row.join_time),
    ].join('|');
    const current = bestByKey.get(key);
    if (!current || Number(row.duration || 0) > Number(current.duration || 0)) {
      bestByKey.set(key, row);
    }
  }
  return [...bestByKey.values()].sort((a, b) => {
    const aTime = a.meeting?.start_time || a.join_time || '';
    const bTime = b.meeting?.start_time || b.join_time || '';
    return String(bTime).localeCompare(String(aTime));
  });
}

async function upsertZoomMeeting(input = {}) {
  const now = new Date().toISOString();
  const row = mapZoomMeeting({
    ...input,
    zoom_meeting_uuid: input.zoom_meeting_uuid || input.uuid,
    zoom_meeting_id: input.zoom_meeting_id || input.id,
    created_at: input.created_at || now,
    updated_at: now,
  });
  if (!row.zoom_meeting_uuid && !row.zoom_meeting_id) throw new Error('Missing Zoom meeting id');

  if (await checkSupabase()) {
    const { error } = await supabase
      .from('zoom_meetings')
      .upsert(row, { onConflict: 'zoom_meeting_uuid' });
    if (!error) return row;
    if (!isMissingTableError(error)) console.warn('[upsertZoomMeeting]', error.message);
  }

  const arr = await fileRead('zoomMeetings');
  const idx = arr.findIndex(m => m.zoom_meeting_uuid === row.zoom_meeting_uuid);
  if (idx !== -1) arr[idx] = { ...arr[idx], ...row, created_at: arr[idx].created_at || now };
  else arr.push({ ...row, created_at: now });
  await fileWrite('zoomMeetings', arr);
  return row;
}

async function upsertLeadZoomAttendances(rows = []) {
  const now = new Date().toISOString();
  const mapped = rows.map(input => mapLeadZoomAttendance({
    ...input,
    id: input.id || crypto.randomUUID(),
    created_at: input.created_at || now,
    updated_at: now,
  })).filter(r => r.lead_email && (r.zoom_meeting_uuid || r.zoom_meeting_id));
  const bestByConflictKey = new Map();
  for (const row of mapped) {
    const key = [
      normalizeEmail(row.lead_email),
      String(row.zoom_meeting_uuid || ''),
      row.join_time || '',
    ].join('|');
    const current = bestByConflictKey.get(key);
    if (!current || Number(row.duration || 0) >= Number(current.duration || 0)) {
      bestByConflictKey.set(key, row);
    }
  }
  const cleaned = [...bestByConflictKey.values()];
  if (!cleaned.length) return [];

  if (await checkSupabase()) {
    const dbRows = cleaned.map(({ lead_phone, ...row }) => row);
    const { error } = await supabase
      .from('lead_zoom_attendances')
      .upsert(dbRows, { onConflict: 'lead_email,zoom_meeting_uuid,join_time' });
    if (!error) return cleaned;
    if (!isMissingTableError(error)) console.warn('[upsertLeadZoomAttendances]', error.message);
  }

  const arr = await fileRead('leadZoomAttendances');
  for (const row of cleaned) {
    const idx = arr.findIndex(r =>
      normalizeEmail(r.lead_email) === row.lead_email &&
      String(r.zoom_meeting_id || '') === String(row.zoom_meeting_id || '') &&
      dateKey(r.join_time) === dateKey(row.join_time)
    );
    if (idx !== -1) {
      const currentDuration = Number(arr[idx].duration || 0);
      const nextDuration = Number(row.duration || 0);
      if (nextDuration >= currentDuration) arr[idx] = { ...arr[idx], ...row, created_at: arr[idx].created_at || now };
    }
    else arr.push({ ...row, created_at: now });
  }
  await fileWrite('leadZoomAttendances', arr);
  return cleaned;
}

async function enrichZoomAttendanceRegistrants(zoomMeetingUuid, registrants = []) {
  const targetUuid = String(zoomMeetingUuid || '');
  const registrantByEmail = indexZoomRegistrantsByEmail(registrants);
  if (!targetUuid || !registrantByEmail.size) return 0;
  const now = new Date().toISOString();
  let updated = 0;

  if (await checkSupabase()) {
    const { data, error } = await supabase
      .from('lead_zoom_attendances')
      .select('id,lead_email,raw')
      .eq('zoom_meeting_uuid', targetUuid);
    if (!error) {
      for (const row of data || []) {
        const registrant = registrantByEmail.get(normalizeEmail(row.lead_email));
        const phone = phoneFromZoomRaw({ registrant });
        if (!registrant || !phone) continue;
        const raw = { ...(row.raw || {}), registrant, phone: (row.raw || {}).phone || phone };
        const res = await supabase
          .from('lead_zoom_attendances')
          .update({ raw, updated_at: now })
          .eq('id', row.id);
        if (!res.error) updated += 1;
      }
      return updated;
    }
    if (!isMissingTableError(error)) console.warn('[enrichZoomAttendanceRegistrants]', error.message);
  }

  const arr = await fileRead('leadZoomAttendances');
  for (let i = 0; i < arr.length; i++) {
    const row = arr[i];
    if (row.zoom_meeting_uuid !== targetUuid) continue;
    const registrant = registrantByEmail.get(normalizeEmail(row.lead_email));
    const phone = phoneFromZoomRaw({ registrant });
    if (!registrant || !phone) continue;
    const raw = { ...(row.raw || {}), registrant, phone: (row.raw || {}).phone || phone };
    arr[i] = { ...row, raw, lead_phone: row.lead_phone || phone, updated_at: now };
    updated += 1;
  }
  if (updated) await fileWrite('leadZoomAttendances', arr);
  return updated;
}

async function linkZoomAttendanceToLead(attendanceId, registrationId) {
  const id = String(attendanceId || '');
  const leadId = String(registrationId || '');
  if (!id || !leadId) return null;
  const now = new Date().toISOString();
  if (await checkSupabase()) {
    const { data, error } = await supabase
      .from('lead_zoom_attendances')
      .update({ registration_id: leadId, updated_at: now })
      .eq('id', id)
      .select('id,registration_id,lead_email,zoom_meeting_uuid,zoom_meeting_id,zoom_display_name,join_time,leave_time,duration,raw,created_at,updated_at')
      .single();
    if (!error) return mapLeadZoomAttendance(data);
    if (!isMissingTableError(error)) console.warn('[linkZoomAttendanceToLead]', error.message);
  }
  const arr = await fileRead('leadZoomAttendances');
  const idx = arr.findIndex(r => r.id === id);
  if (idx === -1) return null;
  arr[idx] = { ...arr[idx], registration_id: leadId, updated_at: now };
  await fileWrite('leadZoomAttendances', arr);
  return mapLeadZoomAttendance(arr[idx]);
}

async function getLeadZoomAttendanceById(attendanceId) {
  const id = String(attendanceId || '');
  if (!id) return null;
  if (await checkSupabase()) {
    const { data, error } = await supabase
      .from('lead_zoom_attendances')
      .select('id,registration_id,lead_email,zoom_meeting_uuid,zoom_meeting_id,zoom_display_name,join_time,leave_time,duration,raw,created_at,updated_at')
      .eq('id', id)
      .single();
    if (!error && data) return mapLeadZoomAttendance(data);
    if (error?.code !== 'PGRST116' && !isMissingTableError(error)) console.warn('[getLeadZoomAttendanceById]', error.message);
  }
  const arr = await fileRead('leadZoomAttendances');
  const row = arr.find(r => r.id === id);
  return row ? mapLeadZoomAttendance(row) : null;
}

async function getLeadZoomAttendances(registrationId, email = '') {
  const leadEmail = normalizeEmail(email);
  let attendanceRows = null;

  if (await checkSupabase()) {
    let query = supabase
      .from('lead_zoom_attendances')
      .select('id,registration_id,lead_email,zoom_meeting_uuid,zoom_meeting_id,zoom_display_name,join_time,leave_time,duration,raw,created_at,updated_at');
    if (registrationId && leadEmail) {
      query = query.or(`registration_id.eq.${registrationId},lead_email.eq.${leadEmail}`);
    } else if (registrationId) {
      query = query.eq('registration_id', registrationId);
    } else if (leadEmail) {
      query = query.eq('lead_email', leadEmail);
    }
    const { data, error } = await query.order('join_time', { ascending: false });
    if (!error) attendanceRows = data || [];
    else if (!isMissingTableError(error)) console.warn('[getLeadZoomAttendances]', error.message);
  }

  if (!attendanceRows) {
    const arr = await fileRead('leadZoomAttendances');
    attendanceRows = arr.filter(r =>
      (registrationId && r.registration_id === registrationId) ||
      (leadEmail && normalizeEmail(r.lead_email) === leadEmail)
    ).sort((a, b) => String(b.join_time || '').localeCompare(String(a.join_time || '')));
  }

  const meetingUuids = [...new Set(attendanceRows.map(r => r.zoom_meeting_uuid).filter(Boolean))];
  const meetingIds = [...new Set(attendanceRows.map(r => String(r.zoom_meeting_id || '')).filter(Boolean))];
  let meetings = [];
  if (meetingUuids.length || meetingIds.length) {
    if (await checkSupabase()) {
      let query = supabase.from('zoom_meetings').select('*');
      if (meetingUuids.length) query = query.in('zoom_meeting_uuid', meetingUuids);
      const { data, error } = await query;
      if (!error) meetings = data || [];
      else if (!isMissingTableError(error)) console.warn('[getLeadZoomAttendances meetings]', error.message);
    }
    if (!meetings.length) {
      const arr = await fileRead('zoomMeetings');
      meetings = arr.filter(m => meetingUuids.includes(m.zoom_meeting_uuid) || meetingIds.includes(String(m.zoom_meeting_id || '')));
    }
  }

  const meetingByUuid = Object.fromEntries(meetings.map(m => [m.zoom_meeting_uuid, mapZoomMeeting(m)]));
  const meetingById = Object.fromEntries(meetings.map(m => [String(m.zoom_meeting_id || ''), mapZoomMeeting(m)]));
  const hydratedRows = attendanceRows.map(r => {
    const row = mapLeadZoomAttendance(r);
    return { ...row, meeting: meetingByUuid[row.zoom_meeting_uuid] || meetingById[row.zoom_meeting_id] || null };
  });
  return dedupeLeadZoomAttendances(hydratedRows);
}

async function getZoomMeetingsOverview() {
  let meetings = null;
  let attendances = null;

  if (await checkSupabase()) {
    const meetingRes = await supabase.from('zoom_meetings').select('*').order('start_time', { ascending: false }).limit(500);
    if (!meetingRes.error) meetings = meetingRes.data || [];
    else if (!isMissingTableError(meetingRes.error)) console.warn('[getZoomMeetingsOverview meetings]', meetingRes.error.message);

    if (meetings?.length) {
      const rows = [];
      const uuids = meetings.map(m => m.zoom_meeting_uuid).filter(Boolean);
      let failed = false;
      for (let i = 0; i < uuids.length; i += 100) {
        const chunk = uuids.slice(i, i + 100);
        const PAGE = 1000;
        for (let page = 0; ; page += 1) {
          const from = page * PAGE;
          const { data, error } = await supabase
            .from('lead_zoom_attendances')
            .select('zoom_meeting_uuid,lead_email,duration,registration_id')
            .in('zoom_meeting_uuid', chunk)
            .range(from, from + PAGE - 1);
          if (error) {
            if (!isMissingTableError(error)) console.warn('[getZoomMeetingsOverview attendances]', error.message);
            failed = true;
            break;
          }
          rows.push(...(data || []));
          if (!data || data.length < PAGE) break;
        }
        if (failed) break;
      }
      if (!failed) attendances = rows;
    } else if (meetings) {
      attendances = [];
    }
  }

  if (!meetings) meetings = await fileRead('zoomMeetings');
  if (!attendances) attendances = await fileRead('leadZoomAttendances');

  const statsByUuid = {};
  for (const row of attendances || []) {
    const uuid = row.zoom_meeting_uuid || '';
    if (!uuid) continue;
    const stat = statsByUuid[uuid] ||= { participant_rows: 0, unique_participants: new Set(), matched_leads: new Set(), total_duration: 0 };
    stat.participant_rows += 1;
    if (row.lead_email) stat.unique_participants.add(normalizeEmail(row.lead_email));
    if (row.registration_id) stat.matched_leads.add(row.registration_id);
    stat.total_duration += Number(row.duration || 0);
  }

  return (meetings || []).map(m => {
    const meeting = mapZoomMeeting(m);
    const stat = statsByUuid[meeting.zoom_meeting_uuid] || { participant_rows: 0, unique_participants: new Set(), matched_leads: new Set(), total_duration: 0 };
    return {
      ...meeting,
      participant_rows: stat.participant_rows || 0,
      unique_participants: stat.unique_participants?.size || 0,
      matched_leads: stat.matched_leads?.size || 0,
      total_participant_duration: stat.total_duration || 0,
    };
  }).sort((a, b) => String(b.start_time || '').localeCompare(String(a.start_time || '')));
}

async function getZoomMeetingDetail(zoomMeetingUuid) {
  const targetUuid = String(zoomMeetingUuid || '');
  if (!targetUuid) return null;
  let meeting = null;
  let attendances = null;

  if (await checkSupabase()) {
    const [meetingRes, attendanceRes] = await Promise.all([
      supabase.from('zoom_meetings').select('*').eq('zoom_meeting_uuid', targetUuid).single(),
      supabase.from('lead_zoom_attendances')
        .select('id,registration_id,lead_email,zoom_meeting_uuid,zoom_meeting_id,zoom_display_name,join_time,leave_time,duration,raw,created_at,updated_at')
        .eq('zoom_meeting_uuid', targetUuid)
        .order('duration', { ascending: false }),
    ]);
    if (!meetingRes.error && meetingRes.data) meeting = meetingRes.data;
    else if (meetingRes.error?.code !== 'PGRST116' && !isMissingTableError(meetingRes.error)) console.warn('[getZoomMeetingDetail meeting]', meetingRes.error.message);
    if (!attendanceRes.error) attendances = attendanceRes.data || [];
    else if (!isMissingTableError(attendanceRes.error)) console.warn('[getZoomMeetingDetail attendances]', attendanceRes.error.message);
  }

  if (!meeting) {
    const meetings = await fileRead('zoomMeetings');
    meeting = meetings.find(m => m.zoom_meeting_uuid === targetUuid) || null;
  }
  if (!meeting) return null;
  if (!attendances) {
    const rows = await fileRead('leadZoomAttendances');
    attendances = rows.filter(r => r.zoom_meeting_uuid === targetUuid);
  }

  const registrations = await getRegistrations();
  const profiles = await getCrmProfiles({ includeInactive: true }).catch(() => []);
  const profileById = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));
  const leadByEmail = new Map();
  for (const lead of registrations || []) {
    const email = normalizeEmail(lead.email);
    if (email && !leadByEmail.has(email)) leadByEmail.set(email, lead);
  }

  const participants = dedupeLeadZoomAttendances((attendances || []).map(r => ({
    ...mapLeadZoomAttendance(r),
    meeting: mapZoomMeeting(meeting),
  }))).map(row => {
    const lead = leadByEmail.get(normalizeEmail(row.lead_email)) || null;
    const assignee = lead?.assigned_to ? profileById[lead.assigned_to] : null;
    return {
      ...row,
      registration_id: row.registration_id || lead?.id || null,
      lead_phone: row.lead_phone || phoneFromZoomRaw(row.raw || {}),
      lead: lead ? {
        id: lead.id,
        name: lead.name || '',
        phone: lead.phone || '',
        email: lead.email || '',
        registered_at: lead.registered_at || null,
        attendance: lead.attendance || '',
        region: lead.region || '',
        assigned_to: lead.assigned_to || '',
        assigned_profile: assignee ? {
          user_id: assignee.user_id,
          full_name: assignee.full_name || '',
          email: assignee.email || '',
          role: assignee.role || '',
        } : null,
      } : null,
    };
  });

  return {
    meeting: mapZoomMeeting(meeting),
    participants,
    stats: {
      participant_rows: (attendances || []).length,
      unique_participants: new Set((attendances || []).map(r => normalizeEmail(r.lead_email)).filter(Boolean)).size,
      shown_participants: participants.length,
      matched_leads: new Set(participants.map(p => p.registration_id).filter(Boolean)).size,
      total_participant_duration: participants.reduce((sum, p) => sum + Number(p.duration || 0), 0),
    },
  };
}

function mapProfile(r) {
  return {
    user_id: r.user_id,
    email: r.email || '',
    full_name: r.full_name || r.email || '',
    role: r.role === 'admin' ? 'admin' : 'sale',
    active: r.active !== false,
    created_at: r.created_at || null,
    updated_at: r.updated_at || null,
  };
}

async function getCrmProfiles({ includeInactive = true } = {}) {
  if (await checkSupabase()) {
    let q = supabase.from('crm_profiles')
      .select('user_id,email,full_name,role,active,created_at,updated_at')
      .order('full_name', { ascending: true });
    if (!includeInactive) q = q.eq('active', true);
    const { data, error } = await q;
    if (!error) return (data || []).map(mapProfile);
  }
  let rows = await fileRead('crmProfiles');
  if (!includeInactive) rows = rows.filter(p => p.active !== false);
  return rows.map(mapProfile);
}

async function upsertCrmProfile(profile) {
  const row = {
    user_id: profile.user_id,
    email: profile.email || '',
    full_name: profile.full_name || profile.email || '',
    role: profile.role === 'admin' ? 'admin' : 'sale',
    active: profile.active !== false,
    updated_at: new Date().toISOString(),
  };
  if (await checkSupabase()) {
    const { error } = await supabase.from('crm_profiles').upsert(row, { onConflict: 'user_id' });
    if (!error) return;
  }
  const arr = await fileRead('crmProfiles');
  const idx = arr.findIndex(p => p.user_id === row.user_id);
  if (idx !== -1) arr[idx] = { ...arr[idx], ...row }; else arr.push({ ...row, created_at: row.updated_at });
  await fileWrite('crmProfiles', arr);
}

async function getCrmSetting(key, defaultValue = null) {
  if (await checkSupabase()) {
    const { data, error } = await supabase
      .from('crm_settings')
      .select('value')
      .eq('key', key)
      .single();
    if (!error && data) return data.value ?? defaultValue;
    if (error && error.code !== 'PGRST116') console.warn('[getCrmSetting]', error.message);
  }
  const arr = await fileRead('crmSettings');
  const row = arr.find(s => s.key === key);
  return row ? row.value : defaultValue;
}

async function setCrmSetting(key, value) {
  const row = { key, value, updated_at: new Date().toISOString() };
  if (await checkSupabase()) {
    const { error } = await supabase.from('crm_settings').upsert(row, { onConflict: 'key' });
    if (!error) return;
    console.warn('[setCrmSetting]', error.message);
  }
  const arr = await fileRead('crmSettings');
  const idx = arr.findIndex(s => s.key === key);
  if (idx !== -1) arr[idx] = { ...arr[idx], ...row }; else arr.push(row);
  await fileWrite('crmSettings', arr);
}

function normalizePageId(input) {
  return String(input || 'default').trim() || 'default';
}

function normalizeLeadWeights(raw, profiles = []) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const weights = {};
  profiles.forEach(p => {
    const n = Number(source[p.user_id]);
    weights[p.user_id] = Number.isFinite(n) && n >= 0 ? Math.min(100, Math.round(n)) : 1;
  });
  return weights;
}

async function getLeadAssignmentConfig(profilesArg = null) {
  const profiles = profilesArg || (await getCrmProfiles({ includeInactive: false })).filter(p => p.role === 'sale');
  const stored = await getCrmSetting('lead_assignment_weights', {});
  return normalizeLeadWeights(stored, profiles);
}

async function setLeadAssignmentConfig(weights) {
  const profiles = (await getCrmProfiles({ includeInactive: true })).filter(p => p.role === 'sale');
  await setCrmSetting('lead_assignment_weights', normalizeLeadWeights(weights, profiles));
}

async function getAssignedCountsForProfiles(profiles = []) {
  const counts = Object.fromEntries(profiles.map(p => [p.user_id, 0]));
  if (await checkSupabase()) {
    const PAGE = 1000;
    const { count, error: countErr } = await supabase
      .from('registrations')
      .select('assigned_to', { count: 'exact', head: true })
      .not('assigned_to', 'is', null);
    if (!countErr && count !== null) {
      let failed = false;
      const numPages = Math.ceil(count / PAGE);
      for (let i = 0; i < numPages; i++) {
        const { data, error } = await supabase
          .from('registrations')
          .select('assigned_to')
          .not('assigned_to', 'is', null)
          .range(i * PAGE, i * PAGE + PAGE - 1);
        if (error) {
          failed = true;
          break;
        }
        (data || []).forEach(r => { if (counts[r.assigned_to] !== undefined) counts[r.assigned_to]++; });
      }
      if (!failed) return counts;
    }
  }

  const regs = await fileRead('registrations');
  regs.forEach(r => { if (counts[r.assigned_to] !== undefined) counts[r.assigned_to]++; });
  return counts;
}

async function getLeadAssignmentStats() {
  const profiles = (await getCrmProfiles({ includeInactive: true })).filter(p => p.role === 'sale');
  const weights = await getLeadAssignmentConfig(profiles);
  const counts = await getAssignedCountsForProfiles(profiles);
  return { profiles, weights, counts };
}

async function pickNextSaleAssignee() {
  const profiles = (await getCrmProfiles({ includeInactive: false }))
    .filter(p => p.role === 'sale');
  if (!profiles.length) return null;
  const weights = await getLeadAssignmentConfig(profiles);
  const eligible = profiles.filter(p => (weights[p.user_id] || 0) > 0);
  if (!eligible.length) return null;

  const orderedEligible = eligible.slice().sort((a, b) =>
    (a.full_name || a.email || '').localeCompare(b.full_name || b.email || '') || a.user_id.localeCompare(b.user_id)
  );

  const chooseByWeightedCursor = async () => {
    const sequence = orderedEligible.flatMap(p => Array.from({ length: Math.max(1, weights[p.user_id] || 1) }, () => p.user_id));
    const signature = sequence.join('|');
    const storedCursor = await getCrmSetting('lead_assignment_cursor', {});
    const rawIndex = storedCursor?.signature === signature ? Number(storedCursor.index) : 0;
    const cursorIndex = Number.isFinite(rawIndex) && sequence.length ? Math.abs(Math.trunc(rawIndex)) % sequence.length : 0;
    const chosenId = sequence[cursorIndex];
    const chosen = orderedEligible.find(p => p.user_id === chosenId) || orderedEligible[0];
    await setCrmSetting('lead_assignment_cursor', {
      signature,
      index: sequence.length ? (cursorIndex + 1) % sequence.length : 0,
      updated_at: new Date().toISOString(),
    }).catch(() => {});
    return chosen;
  };

  return chooseByWeightedCursor();
}

async function assignRegistration(id, userId) {
  const updates = { assigned_to: userId || null, assigned_at: userId ? new Date().toISOString() : null };
  await updateRegistration(id, updates);
}

const FIELD_TYPES = new Set(['text', 'number', 'date', 'boolean', 'dropdown', 'multiselect', 'url', 'currency']);

function slugifyFieldKey(input) {
  return String(input || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function mapCustomField(r) {
  return {
    id: r.id,
    user_id: r.user_id || '',
    label: r.label || '',
    key: r.key || '',
    type: FIELD_TYPES.has(r.type) ? r.type : 'text',
    required: !!r.required,
    default_value: r.default_value || '',
    group_name: r.group_name || 'Thông tin khác',
    sort_order: Number.isFinite(Number(r.sort_order)) ? Number(r.sort_order) : 0,
    options: Array.isArray(r.options) ? r.options : [],
    active: r.active !== false,
    created_at: r.created_at || null,
    updated_at: r.updated_at || null,
  };
}

function buildCustomField(input = {}, current = {}) {
  const label = String(input.label ?? current.label ?? '').trim().slice(0, 120);
  const key = slugifyFieldKey(input.key || current.key || label);
  const rawOptions = Array.isArray(input.options)
    ? input.options
    : String(input.options || current.options || '').split('\n');
  const type = FIELD_TYPES.has(input.type) ? input.type : (current.type || 'text');
  const options = rawOptions.map(s => String(s).trim()).filter(Boolean).slice(0, 80);
  return mapCustomField({
    ...current,
    id: current.id || input.id || crypto.randomUUID(),
    user_id: null,
    label,
    key,
    type,
    required: input.required === true,
    default_value: String(input.default_value ?? current.default_value ?? '').slice(0, 500),
    group_name: String(input.group_name ?? current.group_name ?? 'Khác').trim().slice(0, 80) || 'Khác',
    sort_order: 0,
    options,
    active: true,
    created_at: current.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

async function getCustomFields({ includeInactive = true } = {}) {
  if (await checkSupabase()) {
    const { data, error } = await supabase
      .from('crm_custom_fields')
      .select('id,user_id,label,key,type,required,default_value,group_name,sort_order,options,active,created_at,updated_at')
      .order('sort_order', { ascending: true })
      .order('label', { ascending: true });
    if (!error) {
      const rows = (data || []).map(mapCustomField);
      return includeInactive ? rows : rows.filter(f => f.active !== false);
    }
    if (!isMissingTableError(error)) console.warn('[getCustomFields]', error.message);
  }
  let rows = (await fileRead('customFields')).map(mapCustomField);
  if (!includeInactive) rows = rows.filter(f => f.active !== false);
  return rows.sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

async function upsertCustomField(input) {
  const allFields = await getCustomFields({ includeInactive: true });
  const current = input.id ? allFields.find(f => f.id === input.id) : null;
  const row = buildCustomField(input, current || {});
  if (!row.label || !row.key) throw new Error('Missing custom field label');
  if (allFields.some(f => f.id !== row.id && f.key === row.key)) throw new Error('Custom field key already exists');
  if ((row.type === 'dropdown' || row.type === 'multiselect') && !row.options.length) {
    throw new Error('Dropdown fields require options');
  }
  if (await checkSupabase()) {
    const { error } = await supabase.from('crm_custom_fields').upsert({ ...row, user_id: row.user_id || null }, { onConflict: 'id' });
    if (!error) return row;
    if (!isMissingTableError(error)) console.warn('[upsertCustomField]', error.message);
  }
  const arr = await fileRead('customFields');
  const idx = arr.findIndex(f => f.id === row.id);
  if (idx !== -1) arr[idx] = { ...arr[idx], ...row }; else arr.push(row);
  await fileWrite('customFields', arr);
  return row;
}

async function deleteCustomField(id) {
  if (await checkSupabase()) {
    await supabase.from('crm_custom_field_values').delete().eq('field_id', id);
    const { error } = await supabase.from('crm_custom_fields').delete().eq('id', id);
    if (!error) return;
    if (!isMissingTableError(error)) console.warn('[deleteCustomField]', error.message);
  }
  const arr = await fileRead('customFields');
  await fileWrite('customFields', arr.filter(f => f.id !== id));
  const vals = await fileRead('customFieldValues');
  await fileWrite('customFieldValues', vals.filter(v => v.field_id !== id));
}

function normalizeCustomFieldValue(field, value) {
  if (value === undefined || value === null) return '';
  if (field.type === 'boolean') return value === true || value === 'true' || value === '1' || value === 'on';
  if (field.type === 'number' || field.type === 'currency') {
    const n = Number(value);
    return Number.isFinite(n) ? n : '';
  }
  if (field.type === 'multiselect') {
    const arr = Array.isArray(value) ? value : String(value || '').split(',');
    return arr.map(v => String(v).trim()).filter(v => field.options.includes(v));
  }
  if (field.type === 'dropdown') {
    const v = String(value || '').trim();
    return field.options.includes(v) ? v : '';
  }
  return String(value || '').trim().slice(0, 2000);
}

async function getLeadCustomFieldValues(registrationId) {
  if (await checkSupabase()) {
    const { data, error } = await supabase
      .from('crm_custom_field_values')
      .select('field_id,value,updated_at,updated_by,updated_by_email,updated_by_name')
      .eq('registration_id', registrationId);
    if (!error) return Object.fromEntries((data || []).map(r => [r.field_id, r.value]));
    if (!isMissingTableError(error)) console.warn('[getLeadCustomFieldValues]', error.message);
  }
  const arr = await fileRead('customFieldValues');
  return Object.fromEntries(arr.filter(v => v.registration_id === registrationId).map(v => [v.field_id, v.value]));
}

async function getLeadCustomFieldValuesForIds(registrationIds = []) {
  const ids = [...new Set((registrationIds || []).filter(Boolean))];
  if (!ids.length) return {};
  if (await checkSupabase()) {
    const out = {};
    let failed = false;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      let data = null;
      let error = null;
      try {
        ({ data, error } = await supabase
          .from('crm_custom_field_values')
          .select('registration_id,field_id,value')
          .in('registration_id', chunk));
      } catch (e) {
        error = e;
      }
      if (error) {
        if (!isMissingTableError(error)) console.warn('[getLeadCustomFieldValuesForIds]', error.message);
        failed = true;
        break;
      }
      (data || []).forEach(row => {
        (out[row.registration_id] ||= {})[row.field_id] = row.value;
      });
    }
    if (!failed) return out;
  }
  const arr = await fileRead('customFieldValues');
  const idSet = new Set(ids);
  const out = {};
  arr.filter(v => idSet.has(v.registration_id)).forEach(v => {
    (out[v.registration_id] ||= {})[v.field_id] = v.value;
  });
  return out;
}

async function setLeadCustomFieldValues(registrationId, values, author) {
  const fields = await getCustomFields({ includeInactive: false });
  const byId = Object.fromEntries(fields.map(f => [f.id, f]));
  const now = new Date().toISOString();
  const rows = Object.entries(values || {})
    .filter(([fieldId]) => byId[fieldId])
    .map(([fieldId, raw]) => {
      const field = byId[fieldId];
      const value = normalizeCustomFieldValue(field, raw);
      if (field.required && (value === '' || (Array.isArray(value) && !value.length))) {
        const err = new Error(`Missing required custom field: ${field.label}`);
        err.status = 400;
        throw err;
      }
      return {
        registration_id: registrationId,
        field_id: fieldId,
        value,
        updated_at: now,
        updated_by: author?.id || null,
        updated_by_email: author?.email || '',
        updated_by_name: author?.full_name || author?.email || '',
      };
    });

  if (await checkSupabase()) {
    let failed = false;
    for (const row of rows) {
      const { error } = await supabase
        .from('crm_custom_field_values')
        .upsert(row, { onConflict: 'registration_id,field_id' });
      if (error) {
        if (!isMissingTableError(error)) console.warn('[setLeadCustomFieldValues]', error.message);
        failed = true;
        break;
      }
    }
    if (!failed) return rows;
  }

  const arr = await fileRead('customFieldValues');
  rows.forEach(row => {
    const idx = arr.findIndex(v => v.registration_id === row.registration_id && v.field_id === row.field_id);
    if (idx !== -1) arr[idx] = { ...arr[idx], ...row }; else arr.push(row);
  });
  await fileWrite('customFieldValues', arr);
  return rows;
}

// ── CRM tags ────────────────────────────────────────────────────────────────

function slugifyTag(input) {
  return String(input || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function cleanColor(input, fallback = '#5c6ac4') {
  const v = String(input || '').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}

function mapTagCategory(r) {
  return {
    id: r.id,
    name: r.name || '',
    color: cleanColor(r.color),
    created_at: r.created_at || null,
    updated_at: r.updated_at || null,
  };
}

function mapCrmTag(r, categoryById = {}) {
  const category = r.category || categoryById[r.category_id] || null;
  return {
    id: r.id,
    category_id: r.category_id || '',
    category_name: r.category_name || category?.name || '',
    name: r.name || '',
    slug: r.slug || slugifyTag(r.name),
    color: cleanColor(r.color || category?.color),
    description: r.description || '',
    active: r.active !== false,
    created_at: r.created_at || null,
    updated_at: r.updated_at || null,
  };
}

async function getTagCategories() {
  if (await checkSupabase()) {
    const { data, error } = await supabase
      .from('crm_tag_categories')
      .select('id,name,color,created_at,updated_at')
      .order('name', { ascending: true });
    if (!error) return (data || []).map(mapTagCategory);
    if (!isMissingTableError(error)) console.warn('[getTagCategories]', error.message);
  }
  return (await fileRead('crmTagCategories')).map(mapTagCategory)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function upsertTagCategory(input = {}) {
  const now = new Date().toISOString();
  const row = mapTagCategory({
    id: input.id || crypto.randomUUID(),
    name: String(input.name || '').trim().slice(0, 80),
    color: cleanColor(input.color),
    created_at: input.created_at || now,
    updated_at: now,
  });
  if (!row.name) throw new Error('Missing tag category name');
  if (await checkSupabase()) {
    const { error } = await supabase.from('crm_tag_categories').upsert(row, { onConflict: 'id' });
    if (!error) return row;
    if (!isMissingTableError(error)) console.warn('[upsertTagCategory]', error.message);
  }
  const arr = await fileRead('crmTagCategories');
  const idx = arr.findIndex(c => c.id === row.id);
  if (idx !== -1) arr[idx] = { ...arr[idx], ...row }; else arr.push(row);
  await fileWrite('crmTagCategories', arr);
  return row;
}

async function deleteTagCategory(id) {
  if (await checkSupabase()) {
    const { error } = await supabase.from('crm_tag_categories').delete().eq('id', id);
    if (!error) return;
    if (!isMissingTableError(error)) console.warn('[deleteTagCategory]', error.message);
  }
  const cats = await fileRead('crmTagCategories');
  await fileWrite('crmTagCategories', cats.filter(c => c.id !== id));
  const tags = await fileRead('crmTags');
  await fileWrite('crmTags', tags.map(t => t.category_id === id ? { ...t, category_id: '' } : t));
}

async function getCrmTags({ includeInactive = true } = {}) {
  const categories = await getTagCategories();
  const categoryById = Object.fromEntries(categories.map(c => [c.id, c]));
  if (await checkSupabase()) {
    const { data, error } = await supabase
      .from('crm_tags')
      .select('id,category_id,name,slug,color,description,active,created_at,updated_at')
      .order('name', { ascending: true });
    if (!error) {
      let rows = (data || []).map(r => mapCrmTag(r, categoryById));
      if (!includeInactive) rows = rows.filter(t => t.active !== false);
      return rows.sort((a, b) => (a.category_name || '').localeCompare(b.category_name || '') || a.name.localeCompare(b.name));
    }
    if (!isMissingTableError(error)) console.warn('[getCrmTags]', error.message);
  }
  let rows = (await fileRead('crmTags')).map(r => mapCrmTag(r, categoryById));
  if (!includeInactive) rows = rows.filter(t => t.active !== false);
  return rows.sort((a, b) => (a.category_name || '').localeCompare(b.category_name || '') || a.name.localeCompare(b.name));
}

async function upsertCrmTag(input = {}) {
  const now = new Date().toISOString();
  const categories = await getTagCategories();
  const category = categories.find(c => c.id === input.category_id) || null;
  const current = input.id ? (await getCrmTags({ includeInactive: true })).find(t => t.id === input.id) : null;
  const name = String(input.name ?? current?.name ?? '').trim().slice(0, 80);
  const row = mapCrmTag({
    id: input.id || crypto.randomUUID(),
    category_id: input.category_id || current?.category_id || null,
    name,
    slug: slugifyTag(input.slug || current?.slug || name),
    color: cleanColor(input.color || current?.color || category?.color),
    description: String(input.description ?? current?.description ?? '').trim().slice(0, 500),
    active: input.active !== false,
    created_at: current?.created_at || now,
    updated_at: now,
  }, Object.fromEntries(categories.map(c => [c.id, c])));
  if (!row.name || !row.slug) throw new Error('Missing tag name');
  const allTags = await getCrmTags({ includeInactive: true });
  if (allTags.some(t => t.id !== row.id && t.slug === row.slug)) {
    throw new Error('Tag name already exists');
  }
  if (await checkSupabase()) {
    const { category_name, ...dbRow } = row;
    const { error } = await supabase.from('crm_tags').upsert({ ...dbRow, category_id: row.category_id || null }, { onConflict: 'id' });
    if (!error) return row;
    if (!isMissingTableError(error)) console.warn('[upsertCrmTag]', error.message);
  }
  const arr = await fileRead('crmTags');
  const idx = arr.findIndex(t => t.id === row.id);
  if (idx !== -1) arr[idx] = { ...arr[idx], ...row }; else arr.push(row);
  await fileWrite('crmTags', arr);
  return row;
}

async function deleteCrmTag(id) {
  if (await checkSupabase()) {
    await supabase.from('lead_tags').delete().eq('tag_id', id);
    const { error } = await supabase.from('crm_tags').delete().eq('id', id);
    if (!error) return;
    if (!isMissingTableError(error)) console.warn('[deleteCrmTag]', error.message);
  }
  const tags = await fileRead('crmTags');
  await fileWrite('crmTags', tags.filter(t => t.id !== id));
  const leadTags = await fileRead('leadTags');
  await fileWrite('leadTags', leadTags.filter(t => t.tag_id !== id));
}

async function addLeadTag(registrationId, tagId, author) {
  if (!registrationId || !tagId) return null;
  const activeTags = await getCrmTags({ includeInactive: false });
  if (!activeTags.some(t => t.id === tagId)) return null;
  const now = new Date().toISOString();
  const row = {
    registration_id: registrationId,
    tag_id: tagId,
    assigned_by: author?.id || null,
    assigned_by_email: author?.email || '',
    assigned_by_name: author?.full_name || author?.email || '',
    assigned_at: now,
  };
  if (await checkSupabase()) {
    const { error } = await supabase.from('lead_tags').upsert(row, { onConflict: 'registration_id,tag_id' });
    if (!error) return row;
    if (!isMissingTableError(error)) console.warn('[addLeadTag]', error.message);
  }
  const arr = await fileRead('leadTags');
  const idx = arr.findIndex(t => t.registration_id === registrationId && t.tag_id === tagId);
  if (idx !== -1) arr[idx] = { ...arr[idx], ...row }; else arr.push(row);
  await fileWrite('leadTags', arr);
  return row;
}

async function removeLeadTag(registrationId, tagId) {
  if (!registrationId || !tagId) return;
  if (await checkSupabase()) {
    const { error } = await supabase
      .from('lead_tags')
      .delete()
      .eq('registration_id', registrationId)
      .eq('tag_id', tagId);
    if (!error) return;
    if (!isMissingTableError(error)) console.warn('[removeLeadTag]', error.message);
  }
  const arr = await fileRead('leadTags');
  await fileWrite('leadTags', arr.filter(t => !(t.registration_id === registrationId && t.tag_id === tagId)));
}

const PAGE_TAG_MAPPING_KEY = 'page_tag_mappings';
const PAGE_TAG_CATEGORY_NAME = 'Landing page';

async function getPageTagMappings() {
  const raw = await getCrmSetting(PAGE_TAG_MAPPING_KEY, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

async function setPageTagMappings(map) {
  const cleaned = {};
  Object.entries(map || {}).forEach(([pageId, tagId]) => {
    const p = normalizePageId(pageId);
    const t = String(tagId || '').trim();
    if (p && t) cleaned[p] = t;
  });
  await setCrmSetting(PAGE_TAG_MAPPING_KEY, cleaned);
  return cleaned;
}

async function getOrCreatePageTagCategory() {
  const categories = await getTagCategories();
  const existing = categories.find(c => c.name.toLowerCase() === PAGE_TAG_CATEGORY_NAME.toLowerCase());
  if (existing) return existing;
  return upsertTagCategory({ name: PAGE_TAG_CATEGORY_NAME, color: '#14b8a6' });
}

async function getOrCreatePageTag(pageId) {
  const normalizedPageId = normalizePageId(pageId);
  const category = await getOrCreatePageTagCategory();
  const tags = await getCrmTags({ includeInactive: true });
  const slug = slugifyTag(normalizedPageId) || 'default';
  const existing = tags.find(t => t.slug === slug);
  if (existing) {
    if (existing.active === false) return upsertCrmTag({ ...existing, active: true });
    return existing;
  }
  return upsertCrmTag({
    category_id: category.id,
    name: normalizedPageId,
    slug,
    color: category.color || '#14b8a6',
    description: `Auto tag for landing page ${normalizedPageId}`,
    active: true,
  });
}

async function getPageTagId(pageId) {
  const normalizedPageId = normalizePageId(pageId);
  const mappings = await getPageTagMappings();
  const mappedId = mappings[normalizedPageId];
  if (mappedId) {
    const tags = await getCrmTags({ includeInactive: false });
    if (tags.some(t => t.id === mappedId)) return mappedId;
  }
  const tag = await getOrCreatePageTag(normalizedPageId);
  if (tag?.id && mappings[normalizedPageId] !== tag.id) {
    mappings[normalizedPageId] = tag.id;
    await setPageTagMappings(mappings);
  }
  return tag?.id || '';
}

async function tagLeadByPage(record, author = null) {
  const pageId = normalizePageId(record?.page_id);
  if (!record?.id || !pageId) return null;
  const tagId = await getPageTagId(pageId);
  return addLeadTag(record.id, tagId, author);
}

async function getPageTagConfig({ ensureTags = false } = {}) {
  const registrations = await getRegistrations();
  let mappings = await getPageTagMappings();
  const pageIds = [...new Set([
    ...registrations.map(r => normalizePageId(r.page_id)),
    ...Object.keys(mappings || {}).map(normalizePageId),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));

  if (ensureTags) {
    for (const pageId of pageIds) {
      await getPageTagId(pageId);
    }
    mappings = await getPageTagMappings();
  }

  const tags = await getCrmTags({ includeInactive: false });
  const tagIds = new Set(tags.map(t => t.id));
  return {
    mappings,
    pageIds,
    rows: pageIds.map(page_id => ({
      page_id,
      tag_id: tagIds.has(mappings[page_id]) ? mappings[page_id] : '',
      lead_count: registrations.filter(r => normalizePageId(r.page_id) === page_id).length,
    })),
  };
}

async function setPageTagMapping(pageId, tagId, author = null) {
  const normalizedPageId = normalizePageId(pageId);
  const targetTagId = tagId || await getPageTagId(normalizedPageId);
  const tags = await getCrmTags({ includeInactive: false });
  if (!tags.some(t => t.id === targetTagId)) throw new Error('Invalid tag');
  const mappings = await getPageTagMappings();
  const previousTagId = mappings[normalizedPageId] || '';
  mappings[normalizedPageId] = targetTagId;
  await setPageTagMappings(mappings);
  const result = await syncPageTag(normalizedPageId, { previousTagId, tagId: targetTagId, author });
  return { page_id: normalizedPageId, tag_id: targetTagId, previous_tag_id: previousTagId, ...result };
}

async function syncPageTag(pageId, options = {}) {
  const normalizedPageId = normalizePageId(pageId);
  const targetTagId = options.tagId || await getPageTagId(normalizedPageId);
  const previousTagId = options.previousTagId || '';
  const regs = (await getRegistrations()).filter(r => normalizePageId(r.page_id) === normalizedPageId);
  let updated = 0;
  for (const reg of regs) {
    if (previousTagId && previousTagId !== targetTagId) {
      await removeLeadTag(reg.id, previousTagId);
    }
    await addLeadTag(reg.id, targetTagId, options.author || null);
    updated += 1;
  }
  return { updated, tag_id: targetTagId };
}

async function syncAllPageTags(author = null) {
  const config = await getPageTagConfig();
  const results = [];
  for (const row of config.rows) {
    const result = await syncPageTag(row.page_id, { tagId: row.tag_id || undefined, author });
    results.push({ page_id: row.page_id, ...result });
  }
  return results;
}

async function getLeadTags(registrationId) {
  const tags = await getCrmTags({ includeInactive: true });
  const tagById = Object.fromEntries(tags.map(t => [t.id, t]));
  if (await checkSupabase()) {
    const { data, error } = await supabase
      .from('lead_tags')
      .select('tag_id,assigned_at,assigned_by,assigned_by_email,assigned_by_name')
      .eq('registration_id', registrationId);
    if (!error) return (data || []).map(r => ({ ...tagById[r.tag_id], ...r })).filter(t => t.id || t.tag_id);
    if (!isMissingTableError(error)) console.warn('[getLeadTags]', error.message);
  }
  const arr = await fileRead('leadTags');
  return arr.filter(t => t.registration_id === registrationId).map(r => ({ ...tagById[r.tag_id], ...r })).filter(t => t.id || t.tag_id);
}

async function getLeadTagsForIds(registrationIds = []) {
  const ids = [...new Set((registrationIds || []).filter(Boolean))];
  if (!ids.length) return {};
  const out = {};
  if (await checkSupabase()) {
    let failed = false;
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { data, error } = await supabase
        .from('lead_tags')
        .select('registration_id,tag_id')
        .in('registration_id', chunk);
      if (error) {
        if (!isMissingTableError(error)) console.warn('[getLeadTagsForIds]', error.message);
        failed = true;
        break;
      }
      (data || []).forEach(row => { (out[row.registration_id] ||= []).push(row.tag_id); });
    }
    if (!failed) return out;
  }
  const arr = await fileRead('leadTags');
  const idSet = new Set(ids);
  arr.filter(t => idSet.has(t.registration_id)).forEach(row => { (out[row.registration_id] ||= []).push(row.tag_id); });
  return out;
}

async function getTagPeopleCounts() {
  const byTag = {};
  const add = row => {
    if (!row?.tag_id) return;
    const leadId = row.registration_id || row.lead_id || row.id || '';
    if (!leadId) return;
    (byTag[row.tag_id] ||= new Set()).add(leadId);
  };
  if (await checkSupabase()) {
    try {
      const PAGE = 1000;
      const { count, error: countErr } = await supabase
        .from('lead_tags')
        .select('tag_id,registration_id', { count: 'exact', head: true });
      if (!countErr && count !== null) {
        const numPages = Math.ceil(count / PAGE);
        let failed = false;
        for (let i = 0; i < numPages; i++) {
          const { data, error } = await supabase
            .from('lead_tags')
            .select('tag_id,registration_id')
            .range(i * PAGE, i * PAGE + PAGE - 1);
          if (error) {
            if (!isMissingTableError(error)) console.warn('[getTagPeopleCounts]', error.message);
            failed = true;
            break;
          }
          (data || []).forEach(add);
        }
        if (!failed) return Object.fromEntries(Object.entries(byTag).map(([tagId, set]) => [tagId, set.size]));
      }
    } catch (e) {
      console.warn('[getTagPeopleCounts]', e.message);
    }
  }
  const arr = await fileRead('leadTags');
  arr.forEach(add);
  return Object.fromEntries(Object.entries(byTag).map(([tagId, set]) => [tagId, set.size]));
}

async function getTagPeopleCount(tagId) {
  const id = String(tagId || '');
  if (!id) return 0;
  const counts = await getTagPeopleCounts();
  let count = Number(counts[id] || 0);

  const tags = await getCrmTags({ includeInactive: true });
  const tag = tags.find(t => t.id === id);
  if (!tag) return count;

  const registrations = await getRegistrations();
  const mappings = await getPageTagMappings().catch(() => ({}));
  const mappedPages = Object.entries(mappings)
    .filter(([, mappedTagId]) => mappedTagId === id)
    .map(([pageId]) => normalizePageId(pageId));
  const pageSlug = tag.slug || slugifyTag(tag.name);
  const pageIds = new Set([
    ...mappedPages,
    ...registrations
      .map(r => normalizePageId(r.page_id))
      .filter(pageId => slugifyTag(pageId) === pageSlug),
  ]);
  if (pageIds.size) {
    const pageCount = registrations.filter(r => pageIds.has(normalizePageId(r.page_id))).length;
    count = Math.max(count, pageCount);
  }
  return count;
}

async function setLeadTags(registrationId, tagIds = [], author) {
  const activeTags = await getCrmTags({ includeInactive: false });
  const allowed = new Set(activeTags.map(t => t.id));
  const ids = [...new Set((tagIds || []).filter(id => allowed.has(id)))];
  const now = new Date().toISOString();
  const rows = ids.map(tagId => ({
    registration_id: registrationId,
    tag_id: tagId,
    assigned_by: author?.id || null,
    assigned_by_email: author?.email || '',
    assigned_by_name: author?.full_name || author?.email || '',
    assigned_at: now,
  }));
  if (await checkSupabase()) {
    const del = await supabase.from('lead_tags').delete().eq('registration_id', registrationId);
    if (!del.error) {
      if (!rows.length) return rows;
      const { error } = await supabase.from('lead_tags').insert(rows);
      if (!error) return rows;
      if (!isMissingTableError(error)) console.warn('[setLeadTags]', error.message);
    } else if (!isMissingTableError(del.error)) {
      console.warn('[setLeadTags]', del.error.message);
    }
  }
  const arr = (await fileRead('leadTags')).filter(t => t.registration_id !== registrationId);
  arr.push(...rows);
  await fileWrite('leadTags', arr);
  return rows;
}

function mapLeadNote(r) {
  return {
    id: r.id,
    registration_id: r.registration_id,
    interaction_type: r.interaction_type || 'note',
    body: r.body || '',
    created_at: r.created_at,
    author: {
      user_id: r.author_id || r.author_user_id || '',
      email: r.author_email || '',
      full_name: r.author_name || '',
    },
  };
}

async function getLeadNotes(registrationId) {
  if (await checkSupabase()) {
    let { data, error } = await supabase
      .from('lead_notes')
      .select('id,registration_id,interaction_type,body,created_at,author_id,author_email,author_name')
      .eq('registration_id', registrationId)
      .order('created_at', { ascending: false });
    if (error && /interaction_type/i.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('lead_notes')
        .select('id,registration_id,body,created_at,author_id,author_email,author_name')
        .eq('registration_id', registrationId)
        .order('created_at', { ascending: false }));
    }
    if (!error) return (data || []).map(mapLeadNote);
  }
  const arr = await fileRead('leadNotes');
  return arr.filter(n => n.registration_id === registrationId).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).map(mapLeadNote);
}

const INTERACTION_TYPES = new Set(['call', 'message', 'meeting', 'email', 'note', 'other']);

async function addLeadNote(registrationId, body, author, interactionType = 'note') {
  const createdAt = new Date().toISOString();
  const note = {
    id: crypto.randomUUID(),
    registration_id: registrationId,
    interaction_type: INTERACTION_TYPES.has(interactionType) ? interactionType : 'note',
    body,
    author_id: author?.id || null,
    author_email: author?.email || '',
    author_name: author?.full_name || author?.email || '',
    created_at: createdAt,
  };
  if (await checkSupabase()) {
    let { data, error } = await supabase.from('lead_notes').insert(note).select().single();
    if (error && /interaction_type/i.test(error.message || '')) {
      const { interaction_type, ...legacyNote } = note;
      ({ data, error } = await supabase.from('lead_notes').insert(legacyNote).select().single());
    }
    if (!error && data) {
      await updateRegistration(registrationId, { last_interaction_at: createdAt });
      return mapLeadNote(data);
    }
  }
  const arr = await fileRead('leadNotes');
  arr.push(note);
  await fileWrite('leadNotes', arr);
  await updateRegistration(registrationId, { last_interaction_at: createdAt });
  return mapLeadNote(note);
}

async function deleteLeadNote(registrationId, noteId) {
  const existing = (await getLeadNotes(registrationId)).find(note => note.id === noteId);
  if (!existing) return false;
  if (await checkSupabase()) {
    const { error } = await supabase
      .from('lead_notes')
      .delete()
      .eq('registration_id', registrationId)
      .eq('id', noteId);
    if (!error) return true;
    if (!isMissingTableError(error)) console.warn('[deleteLeadNote]', error.message);
  }
  const arr = await fileRead('leadNotes');
  const next = arr.filter(note => !(note.registration_id === registrationId && note.id === noteId));
  if (next.length === arr.length) return false;
  await fileWrite('leadNotes', next);
  return true;
}

// ── Events ────────────────────────────────────────────────────────────────────

async function getEvents() {
  const cached = cacheGet('events');
  if (cached) return cached;
  let rows;
  if (await checkSupabase()) {
    rows = await fetchAllRows('events');
  }
  if (!rows) rows = await fileRead('events');
  cacheSet('events', rows, TTL.events);
  return rows;
}

async function insertEvent(eventObj) {
  cacheInvalidate('events');
  if (await checkSupabase()) {
    const meta = eventObj.data || null;
    const { error } = await supabase.from('events').insert({
      id:              crypto.randomUUID(),
      data:            eventObj,
      event:           eventObj.event,
      event_timestamp: eventObj.timestamp,
      session_id:      eventObj.session_id,
      ip:              eventObj.ip,
      page_id:         meta?.page_id,
      url:             meta?.url,
      referrer:        meta?.referrer,
      utm_source:      meta?.utm_source,
      utm_medium:      meta?.utm_medium,
      utm_campaign:    meta?.utm_campaign,
      utm_content:     meta?.utm_content,
      utm_term:        meta?.utm_term,
      event_meta:      meta,
    });
    if (!error) return;
    if (error.code === '23505' && eventObj.event === 'pageview') return;
    console.error('[insertEvent] Supabase error:', JSON.stringify(error));
  }
  try {
    const arr = await fileRead('events');
    arr.push(eventObj);
    await fileWrite('events', arr);
  } catch (e) {
    console.error('[insertEvent] file fallback error:', e.message);
  }
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

const WH_COLS = 'id,name,url,active,created_at,updated_at,last_triggered,last_status,last_error,last_duration_ms';

function rowToWebhook(r) {
  return {
    id:              r.id,
    name:            r.name,
    url:             r.url,
    active:          r.active,
    created_at:      r.created_at,
    updated_at:      r.updated_at      || null,
    last_triggered:  r.last_triggered  || null,
    last_status:     r.last_status     ?? null,
    last_error:      r.last_error      || null,
    last_duration_ms: r.last_duration_ms ?? null,
  };
}

async function getWebhooks() {
  if (await checkSupabase()) {
    const { data, error } = await supabase.from('webhooks').select(WH_COLS).order('created_at', { ascending: true }).limit(500);
    if (!error) return data.map(rowToWebhook);
  }
  return fileRead('webhooks');
}

async function getWebhookById(id) {
  if (await checkSupabase()) {
    const { data, error } = await supabase.from('webhooks').select(WH_COLS).eq('id', id).single();
    if (!error && data) return rowToWebhook(data);
  }
  const arr = await fileRead('webhooks');
  return arr.find(w => w.id === id) || null;
}

async function upsertWebhook(wh) {
  if (await checkSupabase()) {
    const { error } = await supabase.from('webhooks').upsert({
      id:              wh.id,
      data:            wh,
      name:            wh.name,
      url:             wh.url,
      active:          wh.active,
      last_triggered:  wh.last_triggered  || null,
      last_status:     wh.last_status     ?? null,
      last_error:      wh.last_error      || null,
      last_duration_ms: wh.last_duration_ms ?? null,
      updated_at:      wh.updated_at      || null,
    });
    if (!error) return;
  }
  const arr = await fileRead('webhooks');
  const idx = arr.findIndex(w => w.id === wh.id);
  if (idx !== -1) arr[idx] = wh; else arr.push(wh);
  await fileWrite('webhooks', arr);
}

async function deleteWebhook(id) {
  if (await checkSupabase()) {
    const { error } = await supabase.from('webhooks').delete().eq('id', id);
    if (!error) return;
  }
  const arr = await fileRead('webhooks');
  await fileWrite('webhooks', arr.filter(w => w.id !== id));
}

async function updateWebhookMeta(id, meta) {
  if (await checkSupabase()) {
    const updates = {};
    if (meta.last_triggered  !== undefined) updates.last_triggered   = meta.last_triggered;
    if (meta.last_status     !== undefined) updates.last_status      = meta.last_status;
    if (meta.last_error      !== undefined) updates.last_error       = meta.last_error;
    if (meta.last_duration_ms !== undefined) updates.last_duration_ms = meta.last_duration_ms;
    const { error } = await supabase.from('webhooks').update(updates).eq('id', id);
    if (!error) return;
  }
  const arr = await fileRead('webhooks');
  const idx = arr.findIndex(w => w.id === id);
  if (idx !== -1) { arr[idx] = { ...arr[idx], ...meta }; await fileWrite('webhooks', arr); }
}

async function insertWebhookLog(webhookId, webhookName, webhookUrl, payload, statusCode, error, durationMs) {
  if (!(await checkSupabase())) return;
  const { error: dbErr } = await supabase.from('webhook_logs').insert({
    id:                 crypto.randomUUID(),
    webhook_id:         webhookId,
    webhook_name:       webhookName,
    webhook_url:        webhookUrl,
    fired_at:           new Date().toISOString(),
    status_code:        statusCode,
    duration_ms:        durationMs,
    error:              error,
    event:              payload.event,
    event_id:           payload.event_id,
    event_source:       payload.event_source,
    contact_name:       payload.contact?.name,
    contact_phone:      payload.contact?.phone,
    contact_email:      payload.contact?.email,
    contact_region:     payload.contact?.region,
    contact_attendance: payload.contact?.attendance,
    utm_source:         payload.utm?.source,
    utm_medium:         payload.utm?.medium,
    utm_campaign:       payload.utm?.campaign,
    utm_content:        payload.utm?.content,
    utm_term:           payload.utm?.term,
    utm_channel:        payload.utm?.channel,
    utm_referrer:       payload.utm?.referrer,
    fbclid:             payload.click_ids?.fbclid,
    gclid:              payload.click_ids?.gclid,
    ttclid:             payload.click_ids?.ttclid,
    msclkid:            payload.click_ids?.msclkid,
    twclid:             payload.click_ids?.twclid,
    fbc:                payload.pixel?.fbc,
    fbp:                payload.pixel?.fbp,
    ga:                 payload.pixel?.ga,
    ip:                 payload.server?.ip,
    user_agent:         payload.server?.user_agent,
    payload:            payload,
  });
  if (dbErr) console.error('[insertWebhookLog]', JSON.stringify(dbErr));
}

// ── Payments ──────────────────────────────────────────────────────────────────

async function getPayment(txnRef) {
  if (await checkSupabase()) {
    const { data, error } = await supabase.from('payments').select('data').eq('id', txnRef).single();
    if (!error && data) return data.data;
  }
  const arr = await fileRead('payments');
  return arr.find(p => p.txn_ref === txnRef) || null;
}

async function insertPayment(record) {
  if (await checkSupabase()) {
    const { error } = await supabase.from('payments').insert({ id: record.txn_ref, data: record });
    if (!error) return;
  }
  const arr = await fileRead('payments');
  arr.push(record);
  await fileWrite('payments', arr);
}

async function updatePayment(txnRef, updates) {
  if (await checkSupabase()) {
    const { data: rows, error } = await supabase.from('payments').select('data').eq('id', txnRef).single();
    if (!error && rows) {
      await supabase.from('payments').update({ data: { ...rows.data, ...updates } }).eq('id', txnRef);
      return;
    }
  }
  const arr = await fileRead('payments');
  const idx = arr.findIndex(p => p.txn_ref === txnRef);
  if (idx !== -1) { arr[idx] = { ...arr[idx], ...updates }; await fileWrite('payments', arr); }
}

async function getPayments() {
  if (await checkSupabase()) {
    const { data, error } = await supabase.from('payments').select('id,data,created_at,updated_at').limit(50000);
    if (!error) return (data || []).map(row => ({ txn_ref: row.id, ...(row.data || {}), created_at: row.data?.created_at || row.created_at, updated_at: row.updated_at }));
  }
  return fileRead('payments');
}

// CRM orders are separate from gateway payments. A lead can own multiple
// orders; each order carries an append-only status transition history.
async function getFunnelOrders(registrationId = '') {
  if (await checkSupabase()) {
    let query = supabase.from('funnel_sales').select('*').order('created_at', { ascending: false }).limit(50000);
    if (registrationId) query = query.eq('registration_id', registrationId);
    const { data, error } = await query;
    if (!error) {
      const rows = data || [];
      const ids = rows.map(row => row.id).filter(Boolean);
      if (!ids.length) return rows;
      const historyResult = await supabase.from('funnel_order_status_history').select('*').in('order_id', ids).order('changed_at', { ascending: false });
      if (!historyResult.error) {
        return rows.map(row => ({ ...row, status_history: (historyResult.data || []).filter(item => item.order_id === row.id) }));
      }
      return rows;
    }
    if (!isMissingTableError(error)) console.error('[getFunnelOrders]', error.message);
  }
  const rows = await fileRead('funnelSales');
  return registrationId ? rows.filter(row => row.registration_id === registrationId) : rows;
}

async function getFunnelOrder(orderId) {
  if (await checkSupabase()) {
    const { data, error } = await supabase.from('funnel_sales').select('*').eq('id', orderId).maybeSingle();
    if (!error && data) {
      const history = await supabase.from('funnel_order_status_history').select('*').eq('order_id', orderId).order('changed_at', { ascending: false });
      return { ...data, status_history: history.error ? [] : (history.data || []) };
    }
    if (!error) return null;
    if (!isMissingTableError(error)) console.error('[getFunnelOrder]', error.message);
  }
  const rows = await fileRead('funnelSales');
  return rows.find(row => row.id === orderId) || null;
}

async function createFunnelOrder(record) {
  const now = new Date().toISOString();
  const row = { id: record.id || crypto.randomUUID(), ...record, created_at: now, updated_at: now };
  const history = { id: crypto.randomUUID(), order_id: row.id, from_status: null, to_status: row.status || 'pending', changed_at: now, changed_by: row.updated_by || null, changed_by_email: row.updated_by_email || '' };
  if (await checkSupabase()) {
    const { data, error } = await supabase.from('funnel_sales').insert(row).select().single();
    if (!error) {
      const savedHistory = await supabase.from('funnel_order_status_history').insert(history);
      if (savedHistory.error && !isMissingTableError(savedHistory.error)) console.error('[createFunnelOrder history]', savedHistory.error.message);
      return { ...data, status_history: [history] };
    }
    if (!isMissingTableError(error)) throw new Error(error.message);
  }
  const rows = await fileRead('funnelSales');
  rows.push({ ...row, status_history: [history] });
  await fileWrite('funnelSales', rows);
  return rows[rows.length - 1];
}

async function updateFunnelOrder(orderId, updates, actor = {}) {
  const existing = await getFunnelOrder(orderId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const row = { ...updates, updated_at: now };
  const statusChanged = updates.status && updates.status !== existing.status;
  const history = statusChanged ? {
    id: crypto.randomUUID(), order_id: orderId, from_status: existing.status || null,
    to_status: updates.status, changed_at: now, changed_by: actor.id || null,
    changed_by_email: actor.email || '',
  } : null;
  if (await checkSupabase()) {
    const { data, error } = await supabase.from('funnel_sales').update(row).eq('id', orderId).select().single();
    if (!error) {
      if (history) await supabase.from('funnel_order_status_history').insert(history);
      return getFunnelOrder(orderId);
    }
    if (!isMissingTableError(error)) throw new Error(error.message);
  }
  const rows = await fileRead('funnelSales');
  const index = rows.findIndex(item => item.id === orderId);
  if (index < 0) return null;
  rows[index] = { ...rows[index], ...row, status_history: history ? [history, ...(rows[index].status_history || [])] : (rows[index].status_history || []) };
  await fileWrite('funnelSales', rows);
  return rows[index];
}

async function deleteFunnelOrder(orderId) {
  if (await checkSupabase()) {
    const { data, error } = await supabase.from('funnel_sales').delete().eq('id', orderId).select('id');
    if (!error) return !!data?.length;
    if (!isMissingTableError(error)) throw new Error(error.message);
  }
  const rows = await fileRead('funnelSales');
  const next = rows.filter(row => row.id !== orderId);
  if (next.length === rows.length) return false;
  await fileWrite('funnelSales', next);
  return true;
}

// ── Surveys ───────────────────────────────────────────────────────────────────

async function insertSurvey(record) {
  const row = {
    id:              record.id || crypto.randomUUID(),
    registration_id: record.registration_id || null,
    page_id:         record.page_id || '30s-trading',
    q1_stage:        record.q1 || record.q1_stage || null,
    q2_problem:      record.q2 || record.q2_problem || null,
    q3_error:        record.q3 || record.q3_error || null,
    q4_goal:         record.q4 || record.q4_goal || null,
    q5_learning:     record.q5 || record.q5_learning || null,
    q6_time:         record.q6 || record.q6_time || null,
    q7_concern:      record.q7 || record.q7_concern || null,
    q8_expectation:  record.q8 || record.q8_expectation || null,
    q9_priority:     record.q9 || record.q9_priority || null,
    submitted_at:    record.submitted_at || new Date().toISOString(),
  };
  if (await checkSupabase()) {
    const { error } = await supabase.from('surveys').insert(row);
    if (!error) return row;
    console.error('[insertSurvey] Supabase error:', JSON.stringify(error));
  }
  const rows = await fileRead('surveys');
  rows.push(row);
  await fileWrite('surveys', rows);
  return row;
}

async function getSurveys() {
  if (await checkSupabase()) {
    const { data, error } = await supabase.from('surveys').select('*').order('submitted_at', { ascending: false });
    if (!error) return data || [];
    console.warn('[getSurveys] database unavailable:', error.message);
  }
  const rows = await fileRead('surveys');
  return rows.sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
}

module.exports = {
  supabase,
  checkSupabase,
  getRegistrations, getRegistrationById, findRegistrationByContact, countRegistrationsByPage, getRegistrationData, insertRegistration, appendRegistrationForm, updateRegistration, mergeRegistrations, deleteRegistration,
  getCrmSetting, setCrmSetting,
  upsertZoomMeeting, upsertLeadZoomAttendances, enrichZoomAttendanceRegistrants, linkZoomAttendanceToLead, getLeadZoomAttendanceById, getLeadZoomAttendances, getZoomMeetingsOverview, getZoomMeetingDetail,
  getCrmProfiles, upsertCrmProfile, pickNextSaleAssignee, assignRegistration,
  getLeadAssignmentConfig, setLeadAssignmentConfig, getLeadAssignmentStats,
  getCustomFields, upsertCustomField, deleteCustomField,
  getLeadCustomFieldValues, getLeadCustomFieldValuesForIds, setLeadCustomFieldValues,
  getTagCategories, upsertTagCategory, deleteTagCategory,
  getCrmTags, upsertCrmTag, deleteCrmTag, getPageTagConfig, setPageTagMapping, syncAllPageTags, tagLeadByPage,
  getLeadTags, getLeadTagsForIds, getTagPeopleCounts, getTagPeopleCount, setLeadTags,
  getLeadNotes, addLeadNote, deleteLeadNote,
  getEvents, insertEvent,
  getWebhooks, getWebhookById, upsertWebhook, deleteWebhook, updateWebhookMeta, insertWebhookLog,
  getPayment, getPayments, insertPayment, updatePayment,
  getFunnelOrders, getFunnelOrder, createFunnelOrder, updateFunnelOrder, deleteFunnelOrder,
  getSurveys, insertSurvey,
};
