#!/usr/bin/env node
// Leads from the WordPress site (Thrive Leads table wp_tve_leads_contacts in an UpdraftPlus
// database backup), cleaned and merged before they enter the CRM.
//   node scripts/wp-leads.cjs prepare <backup-db.gz> <out.json>    (local, on the backup file)
//   node scripts/wp-leads.cjs sync-funnel <prepared.json> --wp-page trading --page trading [--apply]
//   node scripts/wp-leads.cjs import <prepared.json> [--apply]       (on the server; dry run by default)
// Run sync-funnel before import: import then finds those people in the funnel and adds no
// separate "wordpress" lead for them.
// prepare sends nothing anywhere. Its output holds personal data: keep it outside the
// repository and delete it after the import. Reports have counts and masked samples only.
//
// Cleaning: emails trimmed/lowercased (common domain typos fixed), phones to 0xxxxxxxxx
// (VN mobile) or kept as international digits, test entries dropped, entries without a
// valid email or phone dropped. Merging: one lead per email (or per phone when there is no
// email): earliest registration date, latest name/phone/region/interest, first-touch UTM,
// and every registration (date, page, form, source) kept as history.
//
// Import: a lead already in the CRM (same email, or same phone and name, as the Partner API
// merges contacts) keeps its data and gets the WordPress registrations in its form history,
// the tag and a note; other leads are created with page_id "wordpress" and the tag. No sale
// assignment, webhook or CAPI event. Re-runnable: created leads have IDs derived from their
// email/phone, and leads that already carry the tag are skipped.
const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');

const IMPORT_PAGE_ID = 'wordpress';
// WordPress pages whose form now lives in a funnel here (WordPress page -> funnel page_id).
const FUNNEL_PAGES = { trading: 'trading' };
const IMPORT_TAG = { name: 'Nhập từ WordPress', slug: 'nhap-tu-wordpress', color: '#21759b', description: 'Lead từ website WordPress cũ (Thrive Leads), nhập khi chuyển phamthanhbien.com.' };

// Thrive form field IDs -> meaning (labels from the forms' markup; unlabeled ones by their values).
const FIELD = {
  utm_source: [347, 312, 591, 654, 960], utm_medium: [549, 190, 261, 296, 343], utm_campaign: [452, 283, 7, 340],
  utm_content: [547, 151, 558, 940, 301], utm_term: [471, 543, 819], referrer: [595, 880, 529, 517],
  fbclid: [494, 220, 228, 146], gclid: [670, 583, 683], url: [948, 27, 183, 875],
};
const REGION_FIELDS = ['mapping_radio_131', 'mapping_radio_785', 'mapping_radio_819', 'mapping_radio_846', 'mapping_radio_491', 'mapping_select_628', 'mapping_select_574', 'mapping_select_849', 'mapping_select_916'];
const INTEREST_FIELDS = ['mapping_radio_18', 'mapping_radio_456', 'mapping_radio_501'];
const EMAIL_TYPOS = { 'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com', 'gmai.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.om': 'gmail.com', 'gmail.comm': 'gmail.com', 'gmail.vn': 'gmail.com', 'yahoo.con': 'yahoo.com', 'yaho.com': 'yahoo.com', 'icloud.con': 'icloud.com', 'hotmail.con': 'hotmail.com' };
const TEST = /(^|[^a-z])(test|testing|asdf|qwer|abc|xyz|demo|fake|khong co|không có)([^a-z]|$)/i;

// ── SQL dump parsing ──
function* tuples(values) {
  let i = 0;
  const n = values.length;
  while (i < n) {
    if (values[i] !== '(') { i++; continue; }
    i++;
    const row = [];
    let cur = '', quoted = false, wasQuoted = false;
    for (; i < n; i++) {
      const c = values[i];
      if (quoted) {
        if (c === '\\') { const e = values[++i]; cur += e === 'n' ? '\n' : e === 'r' ? '\r' : e === 't' ? '\t' : e === '0' ? '\0' : e; continue; }
        if (c === "'") quoted = false; else cur += c;
      } else if (c === "'") { quoted = true; wasQuoted = true; }
      else if (c === ',') { row.push(wasQuoted || cur.trim() !== 'NULL' ? cur : null); cur = ''; wasQuoted = false; }
      else if (c === ')') { row.push(wasQuoted || cur.trim() !== 'NULL' ? cur : null); yield row; i++; break; }
      else if (c !== ' ' || wasQuoted || cur) cur += c;
    }
  }
}

async function readContacts(file) {
  const rows = [];
  const input = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const line of input) {
    if (!line.startsWith('INSERT INTO `wp_tve_leads_contacts`')) continue;
    for (const [id, , name, email, date, custom] of tuples(line.slice(line.indexOf('VALUES') + 6))) {
      let cf = {};
      try { cf = custom ? JSON.parse(custom) : {}; } catch { cf = {}; }
      rows.push({ id: Number(id), name: name || '', email: email || '', date, cf: cf && typeof cf === 'object' ? cf : {} });
    }
  }
  return rows;
}

// ── Cleaning ──
const text = value => String(value ?? '').replace(/&#a;/g, ' ').replace(/\s+/g, ' ').trim();
const pick = (cf, ids) => { for (const id of ids) { const v = text(cf[`mapping_hidden_${id}`]); if (v && v !== 'null' && v !== 'undefined') return v; } return ''; };

function cleanEmail(value, stats) {
  let email = text(value).toLowerCase().replace(/\s/g, '').replace(/[.,;]+$/, '');
  if (!email) return '';
  const at = email.lastIndexOf('@');
  if (at > 0) {
    const domain = email.slice(at + 1);
    if (EMAIL_TYPOS[domain]) { email = `${email.slice(0, at)}@${EMAIL_TYPOS[domain]}`; stats.emailTyposFixed++; }
  }
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) && !/\.\./.test(email) ? email : '';
}

// VN mobiles as 0xxxxxxxxx; other plausible numbers as +<digits>; '' when unusable.
function cleanPhone(value) {
  const raw = text(value);
  let digits = raw.replace(/\D/g, '');
  if (!digits) return { phone: '', kind: 'none' };
  if (/^84\d{9}$/.test(digits)) digits = '0' + digits.slice(2);
  else if (/^\d{9}$/.test(digits) && /^[35789]/.test(digits)) digits = '0' + digits;
  if (/^0[35789]\d{8}$/.test(digits)) return /^0\d?(\d)\1{7,}$|^0123456789$|^0987654321$/.test(digits) ? { phone: '', kind: 'test' } : { phone: digits, kind: 'vn' };
  if (/^0[2]\d{9}$/.test(digits)) return { phone: digits, kind: 'vn' };
  if (raw.trim().startsWith('+') && digits.length >= 8 && digits.length <= 15) return { phone: '+' + digits, kind: 'intl' };
  return { phone: '', kind: 'invalid' };
}

function cleanRegion(value) {
  const v = text(value).toLowerCase();
  if (!v || v.startsWith('option')) return '';
  if (/hà nội|ha noi|hanoi/.test(v)) return 'Hà Nội';
  if (/hồ chí minh|ho chi minh|hcm|sài gòn|sai gon/.test(v)) return 'Hồ Chí Minh';
  if (/nước ngoài|nuoc ngoai/.test(v)) return 'Nước ngoài';
  return 'Các tỉnh khác';
}

// WordPress stores local time (Asia/Ho_Chi_Minh).
const isoDate = value => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value || '') ? new Date(value.replace(' ', 'T') + '+07:00').toISOString() : null;
const pageOf = (cf, url) => text(cf.page_slug) || (url.match(/phamthanhbien\.com\/([^/?#]+)/) || [])[1] || (cf.post_id ? `post-${cf.post_id}` : '');

function prepare(rows) {
  const stats = { rows: rows.length, emailTyposFixed: 0, droppedTest: 0, droppedNoContact: 0, droppedNoDate: 0, phoneInvalid: 0, phoneIntl: 0, emailMissingOrInvalid: 0 };
  const entries = [];
  for (const r of rows) {
    const cf = r.cf;
    const email = cleanEmail(r.email || cf.inf_field_Email || cf.email, stats);
    const { phone, kind } = cleanPhone(cf.phone || cf.inf_field_Phone1);
    const name = text(r.name) || text(`${text(cf.inf_field_FirstName)} ${text(cf.inf_field_LastName)}`);
    const date = isoDate(r.date);
    if (!date) { stats.droppedNoDate++; continue; }
    if (kind === 'test' || TEST.test(name) || TEST.test(email.split('@')[0] || '') || /@(example|test)\./.test(email)) { stats.droppedTest++; continue; }
    if (!email) stats.emailMissingOrInvalid++;
    if (kind === 'invalid') stats.phoneInvalid++;
    if (kind === 'intl') stats.phoneIntl++;
    if (!email && !phone) { stats.droppedNoContact++; continue; }
    const url = pick(cf, FIELD.url);
    const region = cleanRegion(REGION_FIELDS.map(k => cf[k]).find(v => text(v)));
    const interest = text(INTEREST_FIELDS.map(k => cf[k]).find(v => text(v) && !/^option/i.test(text(v))) || '');
    const utm = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer', 'fbclid', 'gclid'].map(k => [k, pick(cf, FIELD[k]).slice(0, 500)]));
    entries.push({ wp_id: r.id, date, name, email, phone, region, interest, page: pageOf(cf, url), form: text(cf.form_identifier || cf.inf_form_name), url, utm });
  }
  stats.entriesKept = entries.length;

  // One lead per email; entries without email merge by phone.
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.wp_id - b.wp_id);
  const leads = new Map();
  for (const e of entries) {
    const key = e.email || `phone:${e.phone}`;
    let lead = leads.get(key);
    if (!lead) {
      lead = { wp_key: key, name: '', email: e.email, phone: '', region: '', interest: '', registered_at: e.date, last_registered_at: e.date, ...e.utm, landing_url: e.url, registrations: [] };
      leads.set(key, lead);
    }
    if (e.name) lead.name = e.name;
    if (e.phone) lead.phone = e.phone;
    if (e.region) lead.region = e.region;
    if (e.interest) lead.interest = e.interest;
    lead.last_registered_at = e.date;
    lead.registrations.push({ wp_id: e.wp_id, date: e.date, page: e.page, form: e.form, utm_source: e.utm.utm_source, utm_campaign: e.utm.utm_campaign });
  }
  const result = [...leads.values()];
  // A phone on several emails: kept on each lead, but counted for review.
  const phoneOwners = new Map();
  for (const l of result) if (l.phone) phoneOwners.set(l.phone, (phoneOwners.get(l.phone) || 0) + 1);
  stats.leads = result.length;
  stats.leadsWithEmail = result.filter(l => l.email).length;
  stats.leadsPhoneOnly = result.filter(l => !l.email).length;
  stats.leadsWithPhone = result.filter(l => l.phone).length;
  stats.leadsRegisteredMoreThanOnce = result.filter(l => l.registrations.length > 1).length;
  stats.phonesOnSeveralEmails = [...phoneOwners.values()].filter(n => n > 1).length;
  stats.leadsSharingAPhone = [...phoneOwners.values()].filter(n => n > 1).reduce((s, n) => s + n, 0);
  return { leads: result, stats };
}

// ── Report (no personal data) ──
const mask = {
  name: v => v.split(' ').map(w => w ? w[0] + '*'.repeat(Math.max(0, w.length - 1)) : w).join(' '),
  email: v => v ? v.replace(/^(.)[^@]*(@.*)$/, '$1***$2') : '—',
  phone: v => v ? v.slice(0, 3) + '*'.repeat(Math.max(0, v.length - 6)) + v.slice(-3) : '—',
};
function report({ leads, stats }) {
  const count = (items, fn, n = 8) => Object.entries(items.reduce((acc, x) => { const k = fn(x) || '(trống)'; acc[k] = (acc[k] || 0) + 1; return acc; }, {})).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}: ${v}`).join(' · ');
  const regs = leads.flatMap(l => l.registrations);
  console.log(JSON.stringify(stats, null, 1));
  console.log('\nLead theo năm đăng ký đầu:', count(leads, l => l.registered_at.slice(0, 4), 12));
  console.log('Lượt đăng ký theo trang:', count(regs, r => r.page, 12));
  console.log('Khu vực:', count(leads, l => l.region));
  console.log('Quan tâm:', count(leads, l => l.interest));
  console.log('Nguồn đầu tiên (utm_source):', count(leads, l => l.utm_source.toLowerCase(), 10));
  console.log('\nMẫu (đã che):');
  for (const l of [leads[0], leads[Math.floor(leads.length / 2)], leads.find(x => x.registrations.length > 2), leads.find(x => !x.email)].filter(Boolean)) {
    console.log(`  ${mask.name(l.name)} | ${mask.email(l.email)} | ${mask.phone(l.phone)} | ${l.region || '—'} | ${l.registrations.length} lần (${l.registered_at.slice(0, 10)} → ${l.last_registered_at.slice(0, 10)}) | ${[...new Set(l.registrations.map(r => r.page))].join(', ')} | nguồn ${l.utm_source || '—'}`);
  }
}

// ── Import into the CRM ──
const fold = value => text(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z ]/g, '').trim();
// Same person by name: equal, or one name contained in the other ("Nguyễn Văn An" / "An").
const sameName = (a, b) => { const x = fold(a), y = fold(b); return !!x && !!y && (x === y || ` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `)); };
const importId = lead => 'wp-' + crypto.createHash('sha256').update(lead.wp_key).digest('hex').slice(0, 24);

function formEntries(lead) {
  return lead.registrations.map(r => ({
    id: `wp-${r.wp_id}`, source: 'wordpress_import', submitted_at: r.date, captured_at: r.date,
    name: lead.name, phone: lead.phone, email: lead.email, page_id: r.page ? `wp:${r.page}` : IMPORT_PAGE_ID,
    region: lead.region, interest: lead.interest, utm_source: r.utm_source || '', utm_campaign: r.utm_campaign || '', form: r.form || '',
  }));
}
function noteFor(lead) {
  const pages = [...new Set(lead.registrations.map(r => r.page || r.form).filter(Boolean))];
  const day = iso => new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  return `Đã đăng ký trên website WordPress cũ ${lead.registrations.length} lần (${day(lead.registered_at)}${lead.registrations.length > 1 ? ` → ${day(lead.last_registered_at)}` : ''})${pages.length ? `: ${pages.join(', ')}` : ''}. Nguồn đầu tiên: ${lead.utm_source || 'không rõ'}.`;
}

// Matches prepared leads to the CRM. Returns { create, match, skip } without writing.
// Registrations of pages synced into a funnel (FUNNEL_PAGES, sync-funnel) are left out; a lead
// whose WordPress registrations are all in a lead's history already is skipped (re-runnable).
async function planImport(db, leads) {
  const { rows: existing } = await db.query(`select id, name, email, phone,
      (select coalesce(jsonb_agg(f->>'id'), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(data->'registration_forms') = 'array' then data->'registration_forms' else '[]'::jsonb end) f) as form_ids
    from public.registrations order by registered_at, id`);
  const byEmail = new Map(), byPhone = new Map(), ids = new Set(), formOwner = new Map();
  for (const r of existing) {
    ids.add(r.id);
    for (const formId of r.form_ids || []) formOwner.set(formId, r.id);
    // The earliest lead of a person receives the history (the "keep the sale" lead).
    const email = text(r.email).toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, r);
    const { phone } = cleanPhone(r.phone);
    if (phone) (byPhone.get(phone) || byPhone.set(phone, []).get(phone)).push(r);
  }
  const plan = { create: [], matchEmail: [], matchPhone: [], skip: [] };
  for (const full of leads) {
    const registrations = full.registrations.filter(r => !FUNNEL_PAGES[r.page]);
    if (!registrations.length) { plan.skip.push({ lead: full, reason: 'synced into a funnel' }); continue; }
    const lead = registrations.length === full.registrations.length ? full
      : { ...full, registrations, registered_at: registrations[0].date, last_registered_at: registrations[registrations.length - 1].date };
    const id = importId(lead);
    if (ids.has(id)) { plan.skip.push({ lead, id, reason: 'created by an earlier import' }); continue; }
    const byMail = lead.email && byEmail.get(lead.email);
    const byTel = !byMail && lead.phone && (byPhone.get(lead.phone) || []).find(r => sameName(r.name, lead.name));
    const target = byMail || byTel;
    if (target && registrations.every(r => formOwner.has(`wp-${r.wp_id}`))) { plan.skip.push({ lead, id: formOwner.get(`wp-${registrations[0].wp_id}`), reason: 'already imported' }); continue; }
    if (byMail) plan.matchEmail.push({ lead, id: target.id });
    else if (byTel) plan.matchPhone.push({ lead, id: target.id });
    else plan.create.push({ lead, id });
  }
  return plan;
}

async function applyImport(db, plan) {
  const client = typeof db.connect === 'function' ? await db.connect() : db;
  try {
    await client.query('begin');
    let tag = (await client.query('select id from public.crm_tags where slug = $1 and category_id is null', [IMPORT_TAG.slug])).rows[0];
    if (!tag) tag = (await client.query('insert into public.crm_tags (name, slug, color, description) values ($1,$2,$3,$4) returning id', [IMPORT_TAG.name, IMPORT_TAG.slug, IMPORT_TAG.color, IMPORT_TAG.description])).rows[0];
    for (const { lead, id } of plan.create) {
      await client.query(`insert into public.registrations (id, data, name, email, phone, interest, page_id, region, registered_at, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, fbclid, gclid)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) on conflict (id) do nothing`,
        [id, { registration_forms: formEntries(lead).reverse(), import: { source: 'wordpress', key: lead.wp_key, landing_url: lead.landing_url, last_registered_at: lead.last_registered_at } },
          lead.name, lead.email, lead.phone, lead.interest || null, IMPORT_PAGE_ID, lead.region || null, lead.registered_at,
          lead.utm_source || null, lead.utm_medium || null, lead.utm_campaign || null, lead.utm_content || null, lead.utm_term || null, lead.referrer || null, lead.fbclid || null, lead.gclid || null]);
    }
    for (const { lead, id } of [...plan.matchEmail, ...plan.matchPhone]) {
      // History only: the CRM's own name, phone, page and attribution stay as they are.
      const data = (await client.query('select data from public.registrations where id = $1', [id])).rows[0]?.data || {};
      const known = new Set((data.registration_forms || []).map(f => f.id));
      // Newest first, as the CRM keeps registration_forms.
      const forms = [...(data.registration_forms || []), ...formEntries(lead).filter(f => !known.has(f.id))].sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
      await client.query('update public.registrations set data = $2 where id = $1', [id, { ...data, registration_forms: forms }]);
      await client.query(`insert into public.lead_notes (registration_id, interaction_type, body, author_email, author_name) values ($1, 'note', $2, 'import', 'Nhập từ WordPress')`, [id, noteFor(lead)]);
    }
    for (const { id } of [...plan.create, ...plan.matchEmail, ...plan.matchPhone]) {
      await client.query(`insert into public.lead_tags (registration_id, tag_id, assigned_by_email, assigned_by_name) values ($1,$2,'import','Nhập từ WordPress') on conflict do nothing`, [id, tag.id]);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    if (client !== db) client.release?.();
  }
}

// ── Funnel sync: WordPress form of a page that now lives on this system ──
// phamthanhbien.com/trading (form "trading-free") became the course funnel /trading here, so
// those people need a lead in that funnel to sign in. Matched by email in the funnel; a new
// lead takes the sale of the person's existing lead elsewhere (the "keep the sale" rule).
const syncId = (lead, page) => 'wp-' + crypto.createHash('sha256').update(`${lead.wp_key}|${page}`).digest('hex').slice(0, 24);

async function planFunnelSync(db, leads, { wpPage, page }) {
  const { rows } = await db.query(`select id, page_id, lower(trim(email)) as email, assigned_to, registered_at,
      (select coalesce(jsonb_agg(f->>'id'), '[]'::jsonb) from jsonb_array_elements(case when jsonb_typeof(data->'registration_forms') = 'array' then data->'registration_forms' else '[]'::jsonb end) f) as form_ids
    from public.registrations where coalesce(email, '') <> '' order by registered_at, id`);
  const inFunnel = new Map(), sale = new Map(), formOwner = new Map();
  for (const r of rows) {
    for (const formId of r.form_ids || []) formOwner.set(formId, r.id);
    if (r.page_id === page && !inFunnel.has(r.email)) inFunnel.set(r.email, r);
    if (r.assigned_to && !sale.has(r.email)) sale.set(r.email, r.assigned_to);
  }
  const plan = { create: [], match: [], skip: [], page, wpPage };
  for (const lead of leads) {
    const registrations = lead.registrations.filter(r => r.page === wpPage);
    if (!registrations.length || !lead.email) continue;
    // First-touch attribution of this funnel: the lead's own when its first registration was here.
    const utm = lead.registrations[0].wp_id === registrations[0].wp_id ? lead : { utm_source: registrations[0].utm_source, utm_campaign: registrations[0].utm_campaign };
    const subset = { ...lead, registrations, registered_at: registrations[0].date, last_registered_at: registrations[registrations.length - 1].date, utm };
    const existing = inFunnel.get(lead.email);
    const id = existing ? existing.id : syncId(lead, page);
    // Re-runnable: every WordPress registration already in that lead's history.
    if (registrations.every(r => formOwner.get(`wp-${r.wp_id}`) === id)) { plan.skip.push({ lead: subset, id }); continue; }
    if (existing) plan.match.push({ lead: subset, id });
    else plan.create.push({ lead: subset, id, assigned_to: sale.get(lead.email) || null });
  }
  return plan;
}

async function applyFunnelSync(db, plan, { tagByPage } = {}) {
  const client = typeof db.connect === 'function' ? await db.connect() : db;
  try {
    await client.query('begin');
    let tag = (await client.query('select id from public.crm_tags where slug = $1 and category_id is null', [IMPORT_TAG.slug])).rows[0];
    if (!tag) tag = (await client.query('insert into public.crm_tags (name, slug, color, description) values ($1,$2,$3,$4) returning id', [IMPORT_TAG.name, IMPORT_TAG.slug, IMPORT_TAG.color, IMPORT_TAG.description])).rows[0];
    for (const { lead, id, assigned_to } of plan.create) {
      const { utm } = lead;
      await client.query(`insert into public.registrations (id, data, name, email, phone, interest, page_id, region, registered_at, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, fbclid, gclid, assigned_to, assigned_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) on conflict (id) do nothing`,
        [id, { registration_forms: formEntries(lead).reverse(), import: { source: 'wordpress', key: lead.wp_key, wp_page: plan.wpPage, last_registered_at: lead.last_registered_at } },
          lead.name, lead.email, lead.phone, lead.interest || null, plan.page, lead.region || null, lead.registered_at,
          utm.utm_source || null, utm.utm_medium || null, utm.utm_campaign || null, utm.utm_content || null, utm.utm_term || null, utm.referrer || null, utm.fbclid || null, utm.gclid || null,
          assigned_to, assigned_to ? new Date().toISOString() : null]);
    }
    for (const { lead, id } of plan.match) {
      const data = (await client.query('select data from public.registrations where id = $1', [id])).rows[0]?.data || {};
      const known = new Set((data.registration_forms || []).map(f => f.id));
      const forms = [...(data.registration_forms || []), ...formEntries(lead).filter(f => !known.has(f.id))].sort((a, b) => String(b.submitted_at || '').localeCompare(String(a.submitted_at || '')));
      await client.query('update public.registrations set data = $2 where id = $1', [id, { ...data, registration_forms: forms }]);
      await client.query(`insert into public.lead_notes (registration_id, interaction_type, body, author_email, author_name) values ($1, 'note', $2, 'import', 'Nhập từ WordPress')`, [id, `${noteFor(lead)} Người này đã đăng ký phamthanhbien.com/${plan.wpPage} trước khi đăng ký lại tại đây.`]);
    }
    for (const { id } of [...plan.create, ...plan.match]) {
      await client.query(`insert into public.lead_tags (registration_id, tag_id, assigned_by_email, assigned_by_name) values ($1,$2,'import','Nhập từ WordPress') on conflict do nothing`, [id, tag.id]);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    if (client !== db) client.release?.();
  }
  // The funnel's own page tag, as a form registration gets it.
  if (tagByPage) for (const { id } of plan.create) await tagByPage({ id, page_id: plan.page });
}

function importReport(plan) {
  console.log(`Tạo lead mới: ${plan.create.length}`);
  console.log(`Đã có trong CRM, khớp email: ${plan.matchEmail.length}`);
  console.log(`Đã có trong CRM, khớp số điện thoại và tên: ${plan.matchPhone.length}`);
  console.log(`Bỏ qua (đã nhập trước đó): ${plan.skip.length}`);
  console.log('Mẫu (đã che):');
  for (const [label, items] of [['mới', plan.create], ['khớp email', plan.matchEmail], ['khớp SĐT', plan.matchPhone]]) {
    for (const { lead } of items.slice(0, 2)) console.log(`  [${label}] ${mask.name(lead.name)} | ${mask.email(lead.email)} | ${mask.phone(lead.phone)} | ${lead.registrations.length} lần`);
  }
}

if (require.main === module) (async () => {
  const [command, input, output] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (command === 'prepare' && input && output) {
    const result = prepare(await readContacts(input));
    fs.writeFileSync(output, JSON.stringify({ prepared_at: new Date().toISOString(), source: 'wordpress:wp_tve_leads_contacts', stats: result.stats, leads: result.leads }));
    report(result);
    console.log(`\nĐã ghi ${result.leads.length} lead vào ${output}. File có dữ liệu cá nhân: giữ ngoài repo, xóa sau khi nhập.`);
    return;
  }
  if (command === 'sync-funnel' && input) {
    const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : ''; };
    const wpPage = arg('--wp-page'), page = arg('--page');
    if (!wpPage || FUNNEL_PAGES[wpPage] !== page) throw new Error(`sync-funnel needs --wp-page <page> --page <funnel>, one of: ${Object.entries(FUNNEL_PAGES).map(([w, p]) => `--wp-page ${w} --page ${p}`).join('; ')}`);
    require('dotenv').config();
    const { pool } = require('../src/db');
    const { leads } = JSON.parse(fs.readFileSync(input, 'utf8'));
    const plan = await planFunnelSync(pool, leads, { wpPage, page });
    console.log(`phamthanhbien.com/${wpPage} → phễu ${page}`);
    console.log(`Tạo lead trong phễu: ${plan.create.length} (giữ sale của lead ở phễu khác: ${plan.create.filter(p => p.assigned_to).length}, chưa giao: ${plan.create.filter(p => !p.assigned_to).length})`);
    console.log(`Đã có trong phễu (thêm lịch sử, ghi chú, tag): ${plan.match.length}`);
    console.log(`Bỏ qua (đã đồng bộ trước đó): ${plan.skip.length}`);
    for (const { lead } of plan.create.slice(0, 2)) console.log(`  [mới] ${mask.name(lead.name)} | ${mask.email(lead.email)} | ${mask.phone(lead.phone)} | ${lead.registered_at.slice(0, 10)}`);
    if (process.argv.includes('--apply')) {
      const storage = require('../src/storage');
      await applyFunnelSync(pool, plan, { tagByPage: record => storage.tagLeadByPage(record).catch(error => console.warn('[page tag]', error.message)) });
      console.log('\nĐã đồng bộ. Không gửi webhook hay CAPI.');
    } else console.log('\nChạy thử: chưa ghi gì. Thêm --apply để đồng bộ.');
    await pool.end();
    process.exit(0);
  }
  if (command === 'import' && input) {
    require('dotenv').config();
    const { pool } = require('../src/db');
    const { leads } = JSON.parse(fs.readFileSync(input, 'utf8'));
    const plan = await planImport(pool, leads);
    importReport(plan);
    if (process.argv.includes('--apply')) { await applyImport(pool, plan); console.log('\nĐã nhập.'); }
    else console.log('\nChạy thử: chưa ghi gì. Thêm --apply để nhập.');
    await pool.end();
    return;
  }
  console.error('Usage:\n  node scripts/wp-leads.cjs prepare <backup-db.gz> <out.json>\n  node scripts/wp-leads.cjs sync-funnel <prepared.json> --wp-page trading --page trading [--apply]\n  node scripts/wp-leads.cjs import <prepared.json> [--apply]');
  process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });

module.exports = { cleanEmail, cleanPhone, cleanRegion, prepare, tuples, planImport, applyImport, planFunnelSync, applyFunnelSync, sameName, importId, syncId, IMPORT_TAG, IMPORT_PAGE_ID };
