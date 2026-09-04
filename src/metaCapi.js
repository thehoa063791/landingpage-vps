const crypto = require('crypto');
const { extractClientIp } = require('./utils');

const API_VERSION = process.env.META_API_VERSION || 'v21.0';
const DATASET_ID = process.env.META_DATASET_ID || process.env.FB_PIXEL_ID || '';
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE || '';
const ENABLED = process.env.META_CAPI_ENABLED !== 'false';
const TIMEOUT_MS = Number(process.env.META_CAPI_TIMEOUT_MS || 3500);
const DEFAULT_COUNTRY_CODE = process.env.META_PHONE_COUNTRY_CODE || '84';
const DEFAULT_COUNTRY = (process.env.META_DEFAULT_COUNTRY || 'vn').toLowerCase();

const TRACK_EVENT_NAMES = {
  pageview: 'PageView',
  form_open: 'ViewContent',
  form_submit: 'SubmitApplication',
  cta_click: 'Contact',
  conversion: 'CompleteRegistration',
};

const PAGE_VALUES = {
  '14days-challenge': 199000,
  'tt14n-tier2': 4999000,
  'tt14n-quiz': 0,
};

function isConfigured() {
  return ENABLED && !!DATASET_ID && !!ACCESS_TOKEN;
}

function sha256(value, normalizer = normalizeBasic) {
  if (value === undefined || value === null) return null;
  const normalized = normalizer(value);
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function normalizeBasic(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeName(value) {
  return normalizeBasic(value)
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNoSpaces(value) {
  return normalizeBasic(value).replace(/[^\p{L}\p{N}]/gu, '');
}

// Dùng riêng cho ct (city) – strip dấu tiếng Việt → ASCII trước khi hash
function normalizeCityForMeta(value) {
  return String(value || '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .toLowerCase()
    .normalize('NFD')
    .split('').filter(c => { const cp = c.charCodeAt(0); return cp < 0x0300 || cp > 0x036f; }).join('')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeState(value) {
  return normalizeNoSpaces(value).slice(0, 2);
}

function normalizeCountry(value) {
  return normalizeNoSpaces(value).slice(0, 2);
}

function normalizePhone(phone, countryCode = DEFAULT_COUNTRY_CODE) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return countryCode + digits.slice(1);
  if (!digits.startsWith(countryCode)) return countryCode + digits;
  return digits;
}

function reqCookie(req, name) {
  const header = req.headers.cookie || '';
  const m = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function getClientIp(req) {
  return extractClientIp(req);
}

function getOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return host ? `${proto}://${host}` : '';
}

function getSourceUrl(req, data = {}, record = {}) {
  if (data.url) return data.url;
  if (record.event_source_url) return record.event_source_url;
  const origin = getOrigin(req);
  if (!origin) return '';
  const pageId = record.page_id || data.page_id || '';
  return pageId ? `${origin}/p/${encodeURIComponent(pageId)}` : origin;
}

function normalizeFbc(fbc, fbclid) {
  if (fbc && String(fbc).startsWith('fb.')) return fbc;
  const clickId = fbclid || fbc;
  return clickId ? `fb.1.${Date.now()}.${clickId}` : '';
}

function compact(obj) {
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    if (
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0) ||
      (Array.isArray(value) && value.every(item => item === undefined || item === null || item === ''))
    ) {
      delete obj[key];
    }
  });
  return obj;
}

function splitName(fullName) {
  const parts = normalizeName(fullName).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
  };
}

function buildUserData(req, source = {}) {
  const phone = normalizePhone(source.phone);
  const split = splitName(source.name || '');
  const firstName = source.first_name || source.firstName || split.firstName;
  const lastName = source.last_name || source.lastName || split.lastName;
  const city = source.city || source.ct;
  const state = source.state || source.st || source.region;
  const zip = source.zip || source.postal_code || source.zp;
  const country = source.country || DEFAULT_COUNTRY;
  const fbp = source.fbp || reqCookie(req, '_fbp');
  const fbc = normalizeFbc(source.fbc || reqCookie(req, '_fbc'), source.fbclid);

  const userData = {
    client_ip_address: source.ip || getClientIp(req),
    client_user_agent: source.user_agent || req.headers['user-agent'] || '',
    fbp,
    fbc,
    em: source.email ? [sha256(source.email)] : undefined,
    ph: phone ? [sha256(phone)] : undefined,
    fn: firstName ? [sha256(firstName, normalizeName)] : undefined,
    ln: lastName ? [sha256(lastName, normalizeName)] : undefined,
    ct: city ? [sha256(city, normalizeCityForMeta)] : undefined,
    st: state ? [sha256(state, normalizeState)] : undefined,
    zp: zip ? [sha256(zip, normalizeNoSpaces)] : undefined,
    country: country ? [sha256(country, normalizeCountry)] : undefined,
    external_id: source.id || source.session_id ? [sha256(source.id || source.session_id)] : undefined,
  };

  return compact(userData);
}

function eventNameForTrack(event) {
  if (TRACK_EVENT_NAMES[event]) return TRACK_EVENT_NAMES[event];
  return String(event || 'CustomEvent')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, 40) || 'CustomEvent';
}

function buildCustomData(eventName, data = {}, record = {}) {
  const pageId = record.page_id || data.page_id || 'default';
  const value = data.value ?? record.value ?? PAGE_VALUES[pageId];
  const currency = data.currency || record.currency || 'VND';
  const isLeadEvent = eventName === 'Lead' || eventName === 'CompleteRegistration';
  const isCommerceEvent = ['AddToCart', 'InitiateCheckout', 'Purchase'].includes(eventName);
  const contentCategory = data.content_category || (isLeadEvent ? 'lead_generation' : 'landing_page');
  const contentName = data.content_name || record.content_name || pageId;
  const contents = data.contents || (isLeadEvent || isCommerceEvent
    ? [{ id: pageId, quantity: 1, item_price: value || 0 }]
    : undefined);
  const customData = {
    content_name: contentName,
    content_category: contentCategory,
    content_ids: [pageId],
    contents,
    content_type: data.content_type || (isCommerceEvent ? 'product' : undefined),
    num_items: data.num_items || (isLeadEvent || isCommerceEvent ? 1 : undefined),
    status: eventName === 'CompleteRegistration' ? 'complete' : undefined,
    value,
    currency: value !== undefined ? currency : undefined,
    lead_event_source: isLeadEvent ? 'website' : undefined,
  };

  if (data.depth !== undefined) customData.scroll_depth = data.depth;
  if (data.seconds !== undefined) customData.time_on_page_seconds = data.seconds;
  if (data.position) customData.button_position = data.position;
  if (data.method) customData.method = data.method;

  return compact(customData);
}

async function sendEvent({ req, eventName, eventId, data = {}, source = {}, record = {} }) {
  if (!isConfigured()) return { skipped: true, reason: 'missing_meta_config' };

  const finalEventId = eventId || data.event_id || source.event_id || record.id || crypto.randomUUID();
  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: finalEventId,
      event_source_url: getSourceUrl(req, data, record),
      action_source: 'website',
      user_data: buildUserData(req, { ...source, ...record }),
      custom_data: buildCustomData(eventName, data, record),
    }],
    access_token: ACCESS_TOKEN,
  };

  if (TEST_EVENT_CODE) payload.test_event_code = TEST_EVENT_CODE;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://graph.facebook.com/${API_VERSION}/${DATASET_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[Meta CAPI]', eventName, finalEventId, response.status, JSON.stringify(result));
    }
    return { ok: response.ok, status: response.status, event_id: finalEventId, result };
  } catch (error) {
    console.error('[Meta CAPI]', eventName, finalEventId, error.name === 'AbortError' ? 'timeout' : error.message);
    return { ok: false, event_id: finalEventId, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function sendTrackEvent(req, event, data = {}) {
  const eventName = eventNameForTrack(event);
  return sendEvent({
    req,
    eventName,
    eventId: data.event_id || crypto.randomUUID(),
    data,
    source: {
      session_id: req.body?.session_id,
      fbc: data.fbc,
      fbp: data.fbp,
      fbclid: data.fbclid,
    },
  });
}

async function sendRegistrationEvents(req, record) {
  return sendEvent({
    req,
    record,
    source: record,
    eventName: 'CompleteRegistration',
    eventId: record.id,
  });
}

module.exports = {
  isConfigured,
  sendTrackEvent,
  sendRegistrationEvents,
};
