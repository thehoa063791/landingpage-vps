const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('./db');
const storage = require('./storage');
const { parseUA } = require('./utils');

// The /zoom funnel: visitors enter an email; a known customer (HubCRM or a lead of any
// funnel in the local CRM) goes straight to a personal Zoom link, an unknown email first
// completes name, phone and region. Each person is added as a registrant of the configured
// Zoom meeting or webinar, which gives them their own join URL, and every sign-up reaches
// n8n (-> HubCRM). Landing content and the event are set in admin.
const PAGE_ID = 'zoom-event';
// Public origin for share previews and the personal page link sent to n8n.
const SITE_URL = (process.env.SITE_URL || 'https://event.phamthanhbien.com').replace(/\/$/, '');
const TRACKING_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer', 'fbclid', 'gclid', 'ttclid', 'msclkid', 'twclid', 'fbc', 'fbp', 'ga', 'session_id', 'event_source_url'];
const SETTINGS_KEY = 'zoom_event_settings';
const REGIONS = ['Hồ Chí Minh', 'Hà Nội', 'Khu vực khác'];
const DEFAULTS = {
  zoom_kind: 'meeting',
  zoom_id: '',
  starts_at: '',
  duration_minutes: 120,
  // image: the banner already contains the headline; composed: banner is a background
  // and the headline, subtitle and highlights below are HTML.
  hero_mode: 'composed',
  banner_desktop: '',
  banner_mobile: '',
  badge: 'WEBINAR TRỰC TUYẾN',
  title_line1: 'THÔNG BÁO',
  title_line2: 'THAM GIA SỰ KIỆN',
  subtitle: 'Đăng ký ngay để tham gia buổi chia sẻ trực tuyến đặc biệt',
  highlights: ['Diễn giả chuyên gia hàng đầu', 'Kiến thức thực tiễn', 'Cơ hội kết nối cộng đồng doanh nghiệp'],
  button_label: 'Tham gia Zoom',
  privacy_note: 'Thông tin của bạn được bảo mật tuyệt đối và chỉ sử dụng cho sự kiện này.',
  footer_company: 'Công ty Cổ phần Tập đoàn VINMOC',
  footer_tagline: 'Phạm Thành Biên',
  footer_hotline: '086 242 1919',
  footer_email: 'support@vinmoc.com',
  footer_website: 'event.phamthanhbien.com',
  footer_address: 'Tầng 37, Tòa C5, KĐT Đông Nam Trần Duy Hưng, Yên Hòa, Hà Nội',
  share_title: '',
  share_description: '',
  share_image: '',
};
const TEXT_LIMITS = { badge: 60, title_line1: 80, title_line2: 80, subtitle: 240, button_label: 40, privacy_note: 240, footer_company: 120, footer_tagline: 160, footer_hotline: 40, footer_email: 120, footer_website: 160, footer_address: 240, share_title: 160, share_description: 300 };

function failure(status, message, code) { const error = new Error(message); error.status = status; if (code) error.code = code; return error; }
const clean = value => String(value ?? '').trim();
const emailKey = value => clean(value).toLowerCase();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
// Banner and share images: site-relative paths (uploads under /storage) or https URLs.
const safeUrl = value => { const url = clean(value); return /^(?:\/(?!\/)|https:\/\/)[^\s"'<>]*$/.test(url) ? url.slice(0, 1000) : ''; };

function normalizeSettings(raw = {}) {
  const value = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  const out = {};
  for (const key of Object.keys(TEXT_LIMITS)) out[key] = clean(value[key]).slice(0, TEXT_LIMITS[key]);
  out.zoom_kind = value.zoom_kind === 'webinar' ? 'webinar' : 'meeting';
  out.zoom_id = clean(value.zoom_id).replace(/\s+/g, '');
  const start = new Date(value.starts_at);
  out.starts_at = clean(value.starts_at) && Number.isFinite(start.getTime()) ? start.toISOString() : '';
  out.duration_minutes = Math.min(24 * 60, Math.max(15, Math.round(Number(value.duration_minutes) || DEFAULTS.duration_minutes)));
  out.hero_mode = value.hero_mode === 'image' ? 'image' : 'composed';
  out.banner_desktop = safeUrl(value.banner_desktop);
  out.banner_mobile = safeUrl(value.banner_mobile);
  out.share_image = safeUrl(value.share_image);
  const highlights = Array.isArray(value.highlights) ? value.highlights : DEFAULTS.highlights;
  out.highlights = [0, 1, 2].map(i => clean(highlights[i]).slice(0, 80));
  return out;
}

function validateSettings(settings) {
  if (settings.zoom_id && !/^\d{9,12}$/.test(settings.zoom_id)) throw failure(400, 'Meeting/Webinar ID gồm 9–12 chữ số (bỏ khoảng trắng).');
  if (settings.hero_mode === 'image' && !settings.banner_desktop) throw failure(400, 'Chế độ "Ảnh có sẵn chữ" cần ít nhất banner máy tính.');
}

const eventKey = settings => settings.zoom_id ? `${settings.zoom_kind}:${settings.zoom_id}` : '';

function createRepository({ database = pool, directory = path.join(__dirname, '..', 'data'), fallback = process.env.NODE_ENV !== 'production' } = {}) {
  const file = path.join(directory, 'zoom_event_registrations.json');
  const pending = new Map();
  async function serial(key, fn) {
    const previous = pending.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(fn);
    pending.set(key, current);
    try { return await current; } finally { if (pending.get(key) === current) pending.delete(key); }
  }
  // Like learningRepository: only an unreachable database in development uses the file.
  const mayFallback = error => fallback && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(error.code);
  async function readFile() {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  }
  async function list() {
    try { return (await database.query('select data from public.zoom_event_registrations')).rows.map(row => row.data); }
    catch (error) { if (!mayFallback(error)) throw error; return Object.values(await readFile()); }
  }
  async function byAccessKey(accessKey) {
    try { return (await database.query("select data from public.zoom_event_registrations where data->>'access_key'=$1", [accessKey])).rows[0]?.data || null; }
    catch (error) { if (!mayFallback(error)) throw error; return Object.values(await readFile()).find(row => row.access_key === accessKey) || null; }
  }
  async function update(key, mutate) {
    return serial('zoom-event', async () => {
      let client;
      try {
        client = await database.connect();
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(hashtext($1))', [`zoom_event:${key}`]);
        const previous = (await client.query('select data from public.zoom_event_registrations where key=$1', [key])).rows[0]?.data || null;
        const next = await mutate(previous);
        await client.query('insert into public.zoom_event_registrations(key,data) values($1,$2) on conflict(key) do update set data=excluded.data,updated_at=now()', [key, next]);
        await client.query('commit');
        return next;
      } catch (error) {
        if (client) await client.query('rollback').catch(() => {});
        if (!mayFallback(error)) throw error;
        const rows = await readFile();
        const next = await mutate(rows[key] || null);
        rows[key] = next;
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(file, JSON.stringify(rows, null, 2));
        return next;
      } finally { client?.release(); }
    });
  }
  return { list, byAccessKey, update };
}

// Zoom allows 3 "add registrant" calls per email and meeting each day (reset 00:00 GMT),
// so a link Zoom refused is retried after 30 seconds, then 10 minutes, then the next day.
// A network failure (no answer from Zoom) is retried at once, then every 30 seconds
// without counting towards those attempts.
const RETRY_DELAYS_MS = [30000, 10 * 60000];
const NETWORK_RETRY_MS = [500, 1500];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const nextZoomDay = now => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 1)).toISOString();
const rateLimited = error => error.status === 429 || /rate limit/i.test(error.message || '');

// Registration form fields this site can answer from the lead; any other required
// question (address, company, custom questions...) must be made optional in Zoom.
const ANSWERABLE_FIELDS = new Set(['last_name', 'phone', 'city', 'state', 'country']);
const FIELD_LABELS = { address: 'Địa chỉ', city: 'Thành phố', state: 'Tỉnh/Bang', zip: 'Mã bưu điện', country: 'Quốc gia', phone: 'Số điện thoại', industry: 'Ngành nghề', org: 'Tổ chức', job_title: 'Chức danh', purchasing_time_frame: 'Thời gian mua', role_in_purchase_process: 'Vai trò mua hàng', no_of_employees: 'Số nhân viên', comments: 'Câu hỏi/Bình luận', last_name: 'Họ' };
// Zoom shows "first_name last_name": "Nguyễn Văn An" → first "Nguyễn Văn", last "An".
function splitName(name) {
  const words = clean(name).split(/\s+/).filter(Boolean);
  return words.length > 1 ? { first_name: words.slice(0, -1).join(' '), last_name: words.at(-1) } : { first_name: words[0] || '', last_name: '' };
}

// Zoom messages for the most common setup mistakes, shown to admins and in logs.
function zoomProblem(error) {
  const code = Number(error.zoomCode);
  const missing = /parameter is required: (\w+)/i.exec(error.message || '')?.[1];
  if (missing) return `Form đăng ký của buổi Zoom bắt buộc "${FIELD_LABELS[missing] || missing}" nhưng hệ thống không có dữ liệu này. Vào Zoom › Meeting › Registration, bỏ bắt buộc trường đó.`;
  if (error.network) return 'Không kết nối được tới Zoom (lỗi mạng tạm thời). Hệ thống tự thử lại sau 30 giây.';
  if (rateLimited(error)) return 'Zoom giới hạn 3 lần đăng ký mỗi ngày cho email này ở buổi này. Hệ thống tự tạo lại link sau 7:00 sáng (giờ Việt Nam).';
  if (code === 3001 || error.status === 404) return 'Không tìm thấy Meeting/Webinar ID này trên tài khoản Zoom.';
  if (code === 3000 || /registration/i.test(error.message || '')) return 'Buổi Zoom chưa bật đăng ký (Registration). Vào admin › Funnels › Sự kiện Zoom › Cài đặt sự kiện, bấm "Kiểm tra Zoom" rồi "Bật đăng ký tự duyệt".';
  if (code === 3043) return 'Buổi Zoom đã đủ số người đăng ký tối đa.';
  return error.message || 'Zoom không phản hồi.';
}

function createZoomEventService({ repository = createRepository(), crm = storage, zoom = require('./zoomService'), hubcrm = require('./hubcrm'), integrations = {} } = {}) {
  async function settings() { return normalizeSettings(await crm.getCrmSetting(SETTINGS_KEY, {})); }
  async function saveSettings(body = {}) {
    const next = normalizeSettings({ ...await settings(), ...body });
    validateSettings(next);
    await crm.setCrmSetting(SETTINGS_KEY, next);
    return next;
  }
  async function findLead(email) {
    // Any CRM lead counts, whichever funnel created it; the oldest record is the person.
    return (await crm.getRegistrations()).filter(r => emailKey(r.email) === email)
      .sort((a, b) => String(a.registered_at).localeCompare(String(b.registered_at)))[0] || null;
  }
  // HubCRM is the main CRM; when it cannot be reached the local CRM still decides, and an
  // unknown email only means one extra form step.
  async function findPerson(email) {
    const [lead, customer] = await Promise.all([
      findLead(email),
      hubcrm.findCustomerByEmail(email).catch(error => { console.warn('[zoom-event] HubCRM lookup failed, using the local CRM:', error.message); return null; }),
    ]);
    return { lead, customer };
  }
  // Same record shape as /api/register, so the person appears in the local CRM like other funnels.
  async function createLead(fields, body, context) {
    const geo = await (integrations.lookupGeo || require('./utils').lookupGeo)(context.ip).catch(() => null);
    const record = { id: crypto.randomUUID(), interest: '', attendance: 'Zoom event', page_id: PAGE_ID, registered_at: new Date().toISOString(), ip: context.ip || '', user_agent: context.user_agent || '', device: parseUA(context.user_agent || ''), geo, city: geo?.city || '', state: geo?.region || '', zip: geo?.zip || '', ...fields };
    for (const key of TRACKING_FIELDS) record[key] = clean(body[key]).slice(0, 2048);
    await crm.insertRegistration(record);
    await crm.tagLeadByPage(record).catch(error => console.warn('[zoom-event] page tag failed:', error.message));
    return record;
  }
  // New leads (info form) go to n8n like other funnels' registrations, with the person's own
  // page so HubCRM emails can carry it. Known customers (HubCRM or local CRM) are not sent.
  function notify(row, lead, current, isNew, context = {}) {
    const { fireWebhooks, buildWebhookPayload } = integrations.webhooks || require('./webhooks');
    const visit = Object.fromEntries(TRACKING_FIELDS.map(key => [key, context.tracking?.[key]]).filter(([, value]) => value));
    const payload = {
      ...buildWebhookPayload({ ...lead, ...visit, email: row.email, page_id: PAGE_ID, attendance: 'Zoom event', registered_at: row.created_at, event_source_url: context.url || lead.event_source_url || '' }),
      event_id: isNew ? lead.id : `zoom-${crypto.createHash('sha1').update(row.key).digest('hex').slice(0, 24)}`,
      is_new_lead: isNew,
      hubcrm_customer_id: row.hubcrm_customer_id || '',
      zoom: { join_page_url: `${SITE_URL}/zoom/vao-hoc/${row.access_key}`, kind: current.zoom_kind, id: current.zoom_id, starts_at: current.starts_at, duration_minutes: current.duration_minutes, title: [current.title_line1, current.title_line2].filter(Boolean).join(' ') },
    };
    Promise.resolve(fireWebhooks(payload)).catch(error => console.warn('[zoom-event] n8n webhook failed:', error.message));
  }
  const zoomPath = s => `/${s.zoom_kind === 'webinar' ? 'webinars' : 'meetings'}/${zoom.encodeZoomId(s.zoom_id)}`;

  // Simultaneous sign-ups of one email share a single Zoom call; after a failure the next
  // call waits for zoom_retry_at (admin "Tạo lại link lỗi" passes force).
  const creating = new Map();
  function createJoinUrl(row, current, { force = false } = {}) {
    if (row.join_url) return row;
    if (!force && row.zoom_retry_at && Date.parse(row.zoom_retry_at) > Date.now()) return row;
    if (!creating.has(row.key)) creating.set(row.key, requestJoinUrl(row, current).finally(() => creating.delete(row.key)));
    return creating.get(row.key);
  }
  // A person already registered on Zoom (e.g. through Zoom's own form) keeps that link.
  async function findRegistrant(current, email) {
    let token = '';
    for (let page = 0; page < 10; page++) {
      const body = await zoom.zoomRequest('GET', `${zoomPath(current)}/registrants?status=approved&page_size=300${token ? `&next_page_token=${encodeURIComponent(token)}` : ''}`);
      const match = (body.registrants || []).find(r => emailKey(r.email) === email);
      if (match?.join_url) return match;
      token = body.next_page_token || '';
      if (!token) return null;
    }
    return null;
  }
  // The meeting's registration form (which fields Zoom requires), cached for 5 minutes.
  const forms = new Map();
  async function registrationForm(current) {
    const key = zoomPath(current), cached = forms.get(key);
    if (cached && cached.until > Date.now()) return cached.form;
    const body = await zoom.zoomRequest('GET', `${key}/registrants/questions`).catch(() => ({}));
    const form = {
      required: (body.questions || []).filter(q => q.required).map(q => q.field_name),
      custom: (body.custom_questions || []).filter(q => q.required).map(q => q.title),
    };
    forms.set(key, { form, until: Date.now() + 5 * 60000 });
    return form;
  }
  function registrantBody(row, lead, form) {
    const name = clean(lead?.name || row.name) || row.email.split('@')[0];
    const { first_name, last_name } = splitName(name);
    const needs = field => form.required.includes(field);
    const region = clean(lead?.region) && lead.region !== 'Khu vực khác' ? lead.region : '';
    return {
      email: row.email,
      first_name: first_name.slice(0, 64),
      // A one-word name still satisfies a required last name.
      ...(last_name || needs('last_name') ? { last_name: (last_name || '.').slice(0, 64) } : {}),
      ...(lead?.phone ? { phone: clean(lead.phone).slice(0, 30) } : {}),
      ...(region && (needs('city') || needs('state')) ? { city: region, state: region } : {}),
      ...(needs('country') ? { country: 'VN' } : {}),
    };
  }
  async function addRegistrant(current, body) {
    for (let attempt = 0; ; attempt++) {
      try { return await zoom.zoomRequest('POST', `${zoomPath(current)}/registrants`, body); }
      catch (error) {
        if (!error.network || attempt >= NETWORK_RETRY_MS.length) throw error;
        console.warn('[zoom-event] retrying after', error.message);
        await sleep(NETWORK_RETRY_MS[attempt]);
        // The lost request may still have reached Zoom: reuse that registrant if so.
        const existing = await findRegistrant(current, body.email).catch(() => null);
        if (existing) return existing;
      }
    }
  }
  async function requestJoinUrl(row, current) {
    const lead = row.registration_id ? await crm.getRegistrationById(row.registration_id).catch(() => null) : null;
    try {
      const registrant = await addRegistrant(current, registrantBody(row, lead, await registrationForm(current)));
      if (!registrant.join_url) throw new Error('Zoom không trả về link tham gia.');
      return await saveLink(row, registrant);
    } catch (error) {
      const existing = await findRegistrant(current, row.email).catch(() => null);
      if (existing) return saveLink(row, existing);
      const message = zoomProblem(error), now = new Date();
      console.warn('[zoom-event] registrant not created:', message, error.network ? error.message : '');
      return await repository.update(row.key, previous => {
        const day = now.toISOString().slice(0, 10);
        if (error.network) return { ...previous, zoom_error: message, zoom_error_at: now.toISOString(), zoom_retry_at: new Date(now.getTime() + 30000).toISOString() };
        const failures = previous.zoom_failures?.day === day ? previous.zoom_failures.count + 1 : 1;
        const retryAt = rateLimited(error) || failures > RETRY_DELAYS_MS.length ? nextZoomDay(now) : new Date(now.getTime() + RETRY_DELAYS_MS[failures - 1]).toISOString();
        return { ...previous, zoom_error: message, zoom_error_at: now.toISOString(), zoom_retry_at: retryAt, zoom_failures: { day, count: failures } };
      });
    }
  }
  function saveLink(row, registrant) {
    return repository.update(row.key, previous => ({ ...previous, join_url: registrant.join_url, registrant_id: String(registrant.registrant_id || registrant.id || ''), zoom_error: '', zoom_retry_at: null, link_created_at: new Date().toISOString() }));
  }

  async function event(name, row, data = {}, context = {}) {
    await crm.insertEvent({ event: name, event_id: context.event_id || crypto.randomUUID(), session_id: clean(context.session_id).slice(0, 200), ip: context.ip || '', timestamp: new Date().toISOString(), data: { ...data, page_id: PAGE_ID, funnel_id: PAGE_ID, registration_id: row?.registration_id || null, email: row?.email || '', zoom_event: row?.event_key || '', url: clean(context.url).slice(0, 2048), device: parseUA(context.user_agent || '') } }).catch(error => console.warn('[zoom-event] event not stored:', error.message));
  }

  // One row per event and email; repeat sign-ups keep the same personal link.
  async function register(lead, isNew, current, context = {}, customer = null) {
    const email = emailKey(lead.email), key = `${eventKey(current)}|${email}`;
    const hubcrmId = customer?.id || lead.hubcrm_customer_id || '';
    let created = false;
    const row = await repository.update(key, previous => {
      if (previous) return { ...previous, registration_id: previous.registration_id || lead.id, hubcrm_customer_id: previous.hubcrm_customer_id || hubcrmId, last_signup_at: new Date().toISOString(), signups: Number(previous.signups || 1) + 1 };
      created = true;
      return { key, event_key: eventKey(current), zoom_kind: current.zoom_kind, zoom_id: current.zoom_id, email, name: clean(lead.name), registration_id: lead.id, hubcrm_customer_id: hubcrmId, is_new_lead: isNew, access_key: crypto.randomBytes(18).toString('base64url'), join_url: '', join_clicks: 0, signups: 1, created_at: new Date().toISOString(), source: context.tracking || {} };
    });
    if (created) {
      await event('zoom_event_registered', row, { new_lead: isNew, hubcrm_customer: !!hubcrmId }, context);
      if (!isNew && lead.page_id !== PAGE_ID) await crm.tagLeadByPage({ id: lead.id, page_id: PAGE_ID }).catch(error => console.warn('[zoom-event] page tag failed:', error.message));
      if (isNew) notify(row, lead, current, isNew, context);
    }
    return createJoinUrl(row, current);
  }

  async function openEvent() {
    const current = await settings();
    if (!eventKey(current)) throw failure(503, 'Sự kiện chưa mở đăng ký. Vui lòng quay lại sau.', 'not_open');
    return current;
  }

  async function check(body = {}, context = {}) {
    const email = emailKey(body.email);
    if (!validEmail(email)) throw failure(400, 'Vui lòng nhập email hợp lệ.');
    const current = await openEvent();
    const { lead, customer } = await findPerson(email);
    if (!lead && !customer) return { status: 'need_info' };
    // A HubCRM customer new to this site gets a local lead from the HubCRM contact.
    const person = lead || await createLead({ name: customer.name || email.split('@')[0], email, phone: customer.phone, region: '', hubcrm_customer_id: customer.id }, body, context);
    const row = await register(person, false, current, context, customer);
    return { status: 'ready', access_key: row.access_key };
  }

  async function complete(body = {}, context = {}) {
    const email = emailKey(body.email), name = clean(body.name).slice(0, 120), phone = clean(body.phone).slice(0, 30), region = clean(body.region);
    if (!validEmail(email)) throw failure(400, 'Vui lòng nhập email hợp lệ.');
    if (!name) throw failure(400, 'Vui lòng nhập họ và tên.');
    if (!/^\d{9,11}$/.test(phone.replace(/\D/g, ''))) throw failure(400, 'Vui lòng nhập số điện thoại hợp lệ (9–11 số).');
    if (!REGIONS.includes(region)) throw failure(400, 'Vui lòng chọn khu vực.');
    const current = await openEvent();
    const { lead: existing, customer } = await findPerson(email);
    if (existing) {
      const row = await register(existing, false, current, context, customer);
      return { status: 'ready', access_key: row.access_key };
    }
    const record = await createLead({ name, email, phone, region, ...(customer ? { hubcrm_customer_id: customer.id } : {}) }, body, context);
    // Already a HubCRM customer: not a new lead for Meta or the funnel's new-lead count.
    if (customer) {
      const row = await register(record, false, current, context, customer);
      return { status: 'ready', access_key: row.access_key };
    }
    await crm.insertEvent({ event: 'conversion', event_id: record.id, session_id: record.session_id, ip: record.ip, timestamp: new Date().toISOString(), data: { page_id: PAGE_ID, funnel_id: PAGE_ID, registration_id: record.id, email, url: record.event_source_url, utm_source: record.utm_source, utm_medium: record.utm_medium, utm_campaign: record.utm_campaign } }).catch(() => {});
    // Meta CAPI follows the global setting (META_CAPI_ENABLED); never delays the visitor.
    if (context.request) Promise.resolve((integrations.capi || require('./metaCapi')).sendRegistrationEvents(context.request, record)).catch(error => console.warn('[zoom-event] CAPI failed:', error.message));
    const row = await register(record, true, current, context);
    return { status: 'ready', access_key: row.access_key, event_id: record.id };
  }

  // A link from an earlier event moves to the event currently configured in admin.
  async function current(accessKey) {
    const row = /^[A-Za-z0-9_-]{16,64}$/.test(clean(accessKey)) ? await repository.byAccessKey(clean(accessKey)) : null;
    if (!row) throw failure(404, 'Link không hợp lệ hoặc đã hết hạn. Vui lòng đăng ký lại bằng email của bạn.', 'not_found');
    const s = await settings();
    if (!eventKey(s) || row.event_key === eventKey(s)) return { row: eventKey(s) ? await createJoinUrl(row, s) : row, s };
    const lead = row.registration_id ? await crm.getRegistrationById(row.registration_id).catch(() => null) : null;
    return { row: await register(lead || { id: row.registration_id, email: row.email, name: row.name }, false, s), s };
  }

  async function session(accessKey) {
    const { row, s } = await current(accessKey);
    const lead = row.registration_id ? await crm.getRegistrationById(row.registration_id).catch(() => null) : null;
    return { access_key: row.access_key, name: clean(lead?.name || row.name), email: row.email, ready: !!row.join_url, retry_at: row.join_url ? null : row.zoom_retry_at || null, starts_at: s.starts_at, duration_minutes: s.duration_minutes, title: [s.title_line1, s.title_line2].filter(Boolean).join(' ') };
  }

  async function join(accessKey, context = {}) {
    const { row } = await current(accessKey);
    if (!row.join_url) throw failure(503, row.zoom_error ? 'Link Zoom của bạn đang được tạo. Vui lòng thử lại sau ít phút.' : 'Sự kiện chưa mở đăng ký. Vui lòng quay lại sau.', 'link_pending');
    const now = new Date().toISOString();
    await repository.update(row.key, previous => ({ ...previous, join_clicks: Number(previous.join_clicks || 0) + 1, first_join_click_at: previous.first_join_click_at || now, last_join_click_at: now }));
    await event('zoom_join_click', row, {}, context);
    return row.join_url;
  }

  // Admin report: registrations of one event (default: the current one) with CRM contacts.
  async function report({ dateFrom = '', dateTo = '', event: wanted } = {}) {
    const s = await settings();
    const key = wanted === undefined ? eventKey(s) : clean(wanted);
    const from = dateFrom ? new Date(dateFrom).getTime() : -Infinity, to = dateTo ? new Date(dateTo).getTime() : Infinity;
    const [all, leads] = await Promise.all([repository.list(), crm.getRegistrations()]);
    const byId = new Map(leads.map(lead => [lead.id, lead]));
    const events = [...new Set(all.map(row => row.event_key))].map(id => ({ id, registrations: all.filter(row => row.event_key === id).length, current: id === eventKey(s) }));
    const rows = all.filter(row => (!key || row.event_key === key) && (t => t >= from && t <= to)(new Date(row.created_at).getTime()))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map(row => { const lead = byId.get(row.registration_id) || {}; return { key: row.key, email: row.email, name: lead.name || row.name || '', phone: lead.phone || '', region: lead.region || '', registration_id: row.registration_id, hubcrm_customer_id: row.hubcrm_customer_id || '', is_new_lead: !!row.is_new_lead, created_at: row.created_at, link_ready: !!row.join_url, zoom_error: row.join_url ? '' : row.zoom_error || '', zoom_retry_at: row.join_url ? null : row.zoom_retry_at || null, join_clicks: Number(row.join_clicks || 0), first_join_click_at: row.first_join_click_at || null, last_join_click_at: row.last_join_click_at || null, event_key: row.event_key }; });
    return {
      event_key: key, events,
      summary: { registrations: rows.length, new_leads: rows.filter(r => r.is_new_lead).length, existing_leads: rows.filter(r => !r.is_new_lead).length, hubcrm_customers: rows.filter(r => r.hubcrm_customer_id).length, links_ready: rows.filter(r => r.link_ready).length, link_errors: rows.filter(r => !r.link_ready && r.zoom_error).length, clicked: rows.filter(r => r.join_clicks > 0).length },
      rows,
    };
  }

  // Funnel dashboard: opt-ins of the /zoom funnel include CRM leads who signed up again.
  async function registrations() { return repository.list(); }

  async function zoomCheck(body) {
    const s = body ? normalizeSettings({ ...await settings(), ...body }) : await settings();
    if (!s.zoom_id) throw failure(400, 'Nhập Meeting/Webinar ID trước.');
    let info;
    try { info = await zoom.zoomRequest('GET', zoomPath(s)); }
    catch (error) { throw failure(400, zoomProblem(error)); }
    const approval = Number(info.settings?.approval_type ?? 2);
    forms.delete(zoomPath(s));
    const form = await registrationForm(s);
    const blocking = [...form.required.filter(field => !ANSWERABLE_FIELDS.has(field)).map(field => FIELD_LABELS[field] || field), ...form.custom];
    return {
      required_fields: form.required.map(field => FIELD_LABELS[field] || field), blocking_fields: blocking, kind: s.zoom_kind, id: s.zoom_id, topic: info.topic || '', start_time: info.start_time || '', duration: Number(info.duration || 0), timezone: info.timezone || '', type: Number(info.type || 0), registration_enabled: approval !== 2, auto_approve: approval === 0, can_register: s.zoom_kind === 'webinar' || [2, 8].includes(Number(info.type)) };
  }

  async function enableRegistration(body) {
    const s = body ? normalizeSettings({ ...await settings(), ...body }) : await settings();
    const info = await zoomCheck(body);
    if (!info.can_register) throw failure(400, 'Chỉ meeting có lịch cố định (Scheduled, hoặc Recurring có giờ cố định) mới bật được đăng ký. Hãy tạo meeting có lịch trên Zoom.');
    try { await zoom.zoomRequest('PATCH', zoomPath(s), { settings: { approval_type: 0, ...(s.zoom_kind === 'meeting' && info.type === 8 ? { registration_type: 1 } : {}) } }); }
    catch (error) { throw failure(400, zoomProblem(error)); }
    return zoomCheck(body);
  }

  // Admin: retry the links that failed for the current event, e.g. after enabling registration.
  // Emails stopped by Zoom's daily limit wait for their reset instead of using up tomorrow.
  async function retryLinks() {
    const s = await openEvent();
    const rows = (await repository.list()).filter(row => row.event_key === eventKey(s) && !row.join_url);
    let ready = 0, waiting = 0;
    for (const row of rows) {
      if (/giới hạn 3 lần/.test(row.zoom_error || '') && Date.parse(row.zoom_retry_at) > Date.now()) { waiting++; continue; }
      if ((await createJoinUrl(row, s, { force: true })).join_url) ready++;
    }
    return { success: true, total: rows.length, ready, waiting, failed: rows.length - ready - waiting };
  }

  return { settings, saveSettings, retryLinks, check, complete, session, join, report, registrations, zoomCheck, enableRegistration };
}

let instance;
const getZoomEventService = () => instance || (instance = createZoomEventService());
module.exports = { PAGE_ID, SITE_URL, REGIONS, DEFAULTS, normalizeSettings, eventKey, createRepository, createZoomEventService, getZoomEventService };
