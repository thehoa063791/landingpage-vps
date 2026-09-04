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

module.exports = {
  EVERWEBINAR_SETTINGS_KEY,
  getEverWebinarSettings,
  normalizeEverWebinarSettings,
  publicEverWebinarSettings,
  registerEverWebinar,
};
