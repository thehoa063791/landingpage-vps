const { getCrmSetting } = require('./storage');

const EVERWEBINAR_SETTINGS_KEY = 'everwebinar_settings';
const EVERWEBINAR_REGISTER_URL = 'https://api.webinarjam.com/everwebinar/register';

function safeTrim(value) {
  return String(value ?? '').trim();
}

function splitName(fullName) {
  const parts = safeTrim(fullName).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first_name: parts[0] || '', last_name: '' };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1] };
}

function digitsOnly(value) {
  return safeTrim(value).replace(/\D/g, '');
}

function normalizeEverWebinarSettings(raw = {}) {
  return {
    enabled: raw.enabled === true || raw.enabled === 'true',
    api_key: safeTrim(raw.api_key || process.env.EVERWEBINAR_API_KEY),
    webinar_id: safeTrim(raw.webinar_id || process.env.EVERWEBINAR_WEBINAR_ID),
    schedule: safeTrim(raw.schedule || process.env.EVERWEBINAR_SCHEDULE),
    timezone: safeTrim(raw.timezone || process.env.EVERWEBINAR_TIMEZONE || 'GMT+7'),
    timezone_id: safeTrim(raw.timezone_id || process.env.EVERWEBINAR_TIMEZONE_ID),
    date: safeTrim(raw.date || process.env.EVERWEBINAR_DATE),
    phone_country_code: safeTrim(raw.phone_country_code || process.env.EVERWEBINAR_PHONE_COUNTRY_CODE || '+84'),
    twilio_consent: raw.twilio_consent === true || raw.twilio_consent === 'true',
    require_phone: raw.require_phone === true || raw.require_phone === 'true',
    join_url_type: ['live_room_url', 'replay_room_url', 'thank_you_url'].includes(raw.join_url_type) ? raw.join_url_type : 'live_room_url',
  };
}

async function getEverWebinarSettings() {
  return normalizeEverWebinarSettings(await getCrmSetting(EVERWEBINAR_SETTINGS_KEY, {}));
}

function publicEverWebinarSettings(settings) {
  const cfg = normalizeEverWebinarSettings(settings);
  return {
    ...cfg,
    api_key: cfg.api_key ? '********' : '',
    configured: !!(cfg.api_key && cfg.webinar_id && cfg.schedule),
  };
}

function requireEverWebinarConfig(settings) {
  const missing = [];
  if (!settings.api_key) missing.push('API key');
  if (!settings.webinar_id) missing.push('Webinar ID');
  if (!settings.schedule) missing.push('Schedule ID');
  if (missing.length) {
    const err = new Error(`Thieu cau hinh EverWebinar: ${missing.join(', ')}.`);
    err.code = 'EVERWEBINAR_NOT_CONFIGURED';
    throw err;
  }
}

async function registerEverWebinar(lead, options = {}) {
  const settings = normalizeEverWebinarSettings(options.settings || await getEverWebinarSettings());
  if (!settings.enabled && !options.force) return null;
  requireEverWebinarConfig(settings);

  const { first_name, last_name } = splitName(lead.name);
  const body = new URLSearchParams({
    api_key: settings.api_key,
    webinar_id: settings.webinar_id,
    first_name: first_name || safeTrim(lead.name),
    email: safeTrim(lead.email).toLowerCase(),
    schedule: settings.schedule,
  });

  if (last_name) body.set('last_name', last_name);
  if (settings.timezone) body.set('timezone', settings.timezone);
  if (settings.timezone_id) body.set('timezone_id', settings.timezone_id);
  if (settings.date) body.set('date', settings.date);
  if (lead.ip) body.set('ip_address', lead.ip);

  const phone = digitsOnly(lead.phone);
  if (phone || settings.require_phone) {
    body.set('phone_country_code', settings.phone_country_code || '+84');
    body.set('phone', phone);
    body.set('twilio_consent', settings.twilio_consent ? 'true' : 'false');
  }

  const response = await fetch(EVERWEBINAR_REGISTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body,
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok || payload.status !== 'success' || !payload.user) {
    const err = new Error(payload.message || payload.error || `EverWebinar HTTP ${response.status}`);
    err.code = 'EVERWEBINAR_REGISTER_FAILED';
    err.payload = payload;
    throw err;
  }

  const user = payload.user || {};
  const joinUrl = user[settings.join_url_type] || user.live_room_url || user.thank_you_url || user.replay_room_url || '';
  return {
    provider: 'everwebinar',
    webinar_id: user.webinar_id || settings.webinar_id,
    webinar_hash: user.webinar_hash || '',
    user_id: user.user_id || '',
    schedule: user.schedule || settings.schedule,
    date: user.date || settings.date || '',
    timezone: user.timezone || settings.timezone || '',
    join_url: joinUrl,
    live_room_url: user.live_room_url || '',
    replay_room_url: user.replay_room_url || '',
    thank_you_url: user.thank_you_url || '',
  };
}

// The room of one person for one session of a weekly webinar. The API's schedule IDs differ from
// the dashboard's, so they are read from the webinar (cached a few minutes); `at` is the session
// in Vietnam time ("YYYY-MM-DD HH:MM"), passed as date only when the webinar lists that time.
const EVERWEBINAR_DETAILS_URL = 'https://api.webinarjam.com/everwebinar/webinar';
const scheduleCache = new Map();
async function webinarSchedules(apiKey, webinarId, { fresh = false } = {}) {
  const cached = scheduleCache.get(webinarId);
  if (!fresh && cached && cached.until > Date.now()) return cached.schedules;
  const response = await fetch(EVERWEBINAR_DETAILS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ api_key: apiKey, webinar_id: webinarId, timezone: 'GMT+7' }),
  });
  const payload = await response.json().catch(() => ({}));
  const schedules = (payload.webinar || payload).schedules;
  if (!response.ok || !Array.isArray(schedules) || !schedules.length) {
    throw Object.assign(new Error(`EverWebinar details HTTP ${response.status}`), { code: 'EVERWEBINAR_DETAILS_FAILED' });
  }
  scheduleCache.set(webinarId, { schedules, until: Date.now() + 10 * 60 * 1000 });
  return schedules;
}

async function registerSessionRoom({ apiKey, webinarId, at, lead }) {
  const schedules = await webinarSchedules(apiKey, webinarId);
  const exact = schedules.find(item => String(item.date || '') === at);
  const chosen = exact || schedules.find(item => String(item.date || '').slice(0, 10) === at.slice(0, 10)) || schedules[0];
  const room = await registerEverWebinar(lead, { force: true, settings: { enabled: true, api_key: apiKey, webinar_id: webinarId, schedule: String(chosen.schedule), timezone: 'GMT+7', date: exact ? at : '', join_url_type: 'live_room_url' } });
  return room.live_room_url || room.join_url || '';
}

// Who registered for a webinar and whether they watched, every page of /everwebinar/registrants.
// `event` is the evening the person was in ("Mon, 16 Nov 2026, 08:00 PM", the webinar's own time
// zone; for the "Direct link" schedule the moment they entered); it becomes "YYYY-MM-DD HH:MM".
const EVERWEBINAR_REGISTRANTS_URL = 'https://api.webinarjam.com/everwebinar/registrants';
const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
function everwebinarMoment(text) {
  const match = /(\d{1,2}) ([A-Z][a-z]{2}) (\d{4}),? (\d{1,2}):(\d{2}) ?(AM|PM)/.exec(String(text || ''));
  if (!match || !MONTHS[match[2]]) return '';
  const hour = Number(match[4]) % 12 + (match[6] === 'PM' ? 12 : 0);
  return `${match[3]}-${MONTHS[match[2]]}-${match[1].padStart(2, '0')} ${String(hour).padStart(2, '0')}:${match[5]}`;
}
const seconds = text => String(text || '').split(':').map(Number).reduce((sum, part) => (Number.isFinite(part) ? sum * 60 + part : sum), 0);
async function webinarRegistrants({ apiKey, webinarId, maxPages = 400, timeout = 20000 }) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetch(EVERWEBINAR_REGISTRANTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ api_key: apiKey, webinar_id: webinarId, date_range: '0', page: String(page) }),
      signal: AbortSignal.timeout(timeout),
    });
    const payload = await response.json().catch(() => ({}));
    const box = payload.registrants;
    if (!response.ok || !box || !Array.isArray(box.data)) {
      throw Object.assign(new Error(`EverWebinar registrants HTTP ${response.status}`), { code: 'EVERWEBINAR_REGISTRANTS_FAILED' });
    }
    for (const row of box.data) {
      rows.push({
        email: safeTrim(row.email).toLowerCase(),
        event_at: everwebinarMoment(row.event),
        schedule: safeTrim(row.schedule),
        attended_live: row.attended_live === 'Yes',
        live_seconds: seconds(row.time_live),
        attended_replay: row.attended_replay === 'Yes',
        replay_seconds: seconds(row.time_replay),
      });
    }
    if (!box.data.length || page >= Number(box.last_page || 1)) break;
  }
  return rows;
}

module.exports = {
  registerSessionRoom,
  webinarRegistrants,
  webinarSchedules,
  everwebinarMoment,
  EVERWEBINAR_SETTINGS_KEY,
  getEverWebinarSettings,
  normalizeEverWebinarSettings,
  publicEverWebinarSettings,
  registerEverWebinar,
};
