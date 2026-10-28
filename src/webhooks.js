const { getWebhooks, updateWebhookMeta, insertWebhookLog } = require('./storage');
const { classifyChannel } = require('./utils');
const { flatTouch } = require('./attribution');
const http = require('http');
const https = require('https');

function webhookErrorMessage(error, timeoutMs) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return `Timeout - endpoint khong phan hoi trong ${Math.round(timeoutMs / 1000)} giay`;
  }
  const parts = [];
  if (error?.message) parts.push(error.message);
  const cause = error?.cause;
  if (cause?.code) parts.push(cause.code);
  if (cause?.syscall) parts.push(cause.syscall);
  if (cause?.address || cause?.port) parts.push([cause.address, cause.port].filter(Boolean).join(':'));
  if (cause?.message && cause.message !== error?.message) parts.push(cause.message);
  return parts.filter(Boolean).join(' | ') || 'Webhook request failed';
}

function postJsonWithHttpClient(url, payload, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = JSON.stringify(payload);
    const transport = target.protocol === 'http:' ? http : https;
    const req = transport.request(target, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: timeoutMs,
    }, res => {
      res.resume();
      res.on('end', () => resolve({
        status: res.statusCode || null,
        statusText: res.statusMessage || '',
      }));
    });

    req.on('timeout', () => {
      req.destroy(Object.assign(new Error(`Timeout - endpoint khong phan hoi trong ${Math.round(timeoutMs / 1000)} giay`), { name: 'TimeoutError' }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendWebhookOnce(wh, payload, headers, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(wh.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    return {
      status: res.status,
      error: res.ok ? null : `HTTP ${res.status} ${res.statusText}`.trim(),
      transport: 'fetch',
    };
  } catch (e) {
    const fetchError = webhookErrorMessage(e, timeoutMs);
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
      return { status: null, error: fetchError, transport: 'fetch' };
    }

    try {
      const fallback = await postJsonWithHttpClient(wh.url, payload, {
        ...headers,
        'X-Webhook-Transport': 'https-request-fallback',
      }, timeoutMs);
      return {
        status: fallback.status,
        error: fallback.status >= 200 && fallback.status < 300
          ? null
          : `fetch failed (${fetchError}); fallback HTTP ${fallback.status || 'unknown'} ${fallback.statusText || ''}`.trim(),
        transport: 'https-request-fallback',
      };
    } catch (fallbackError) {
      return {
        status: null,
        error: `fetch failed (${fetchError}); fallback failed (${webhookErrorMessage(fallbackError, timeoutMs)})`,
        transport: 'failed',
      };
    } finally {
      clearTimeout(timer);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function postWebhook(wh, payload, options = {}) {
  const timeoutMs = options.timeoutMs || 7000;
  const source = options.source || 'landingpage';
  const maxAttempts = Math.max(1, Number(options.attempts || process.env.WEBHOOK_RETRY_ATTEMPTS || 3));
  const start = Date.now();
  let status = null;
  let error = null;
  const attemptErrors = [];

  const headers = {
    'Content-Type': 'application/json',
    'X-Webhook-Source': source,
    'X-Webhook-Event': payload.event || '',
    'X-Webhook-Event-Id': payload.event_id || '',
    'User-Agent': 'landingpage-webhook/1.0',
    'Connection': 'close',
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await sendWebhookOnce(wh, payload, {
      ...headers,
      'X-Webhook-Attempt': String(attempt),
    }, timeoutMs);
    status = result.status;
    error = result.error;

    if (!error && status >= 200 && status < 300) break;

    attemptErrors.push(`attempt ${attempt}/${maxAttempts}: ${error || `HTTP ${status || 'unknown'}`}`);
    const retryable = !status || status >= 500 || status === 408 || status === 429;
    if (!retryable || attempt === maxAttempts) break;
    await wait(Math.min(1000 * attempt, 2500));
  }

  if (attemptErrors.length && error) {
    error = attemptErrors.join(' | ');
  }

  if (attemptErrors.length) {
    console.warn('[webhook delivery]', wh.name || wh.id, wh.url, attemptErrors.join(' | '));
  }

  const duration = Date.now() - start;
  const meta = {
    last_triggered: new Date().toISOString(),
    last_status: status,
    last_error: error,
    last_duration_ms: duration,
  };

  await Promise.all([
    updateWebhookMeta(wh.id, meta),
    insertWebhookLog(wh.id, wh.name, wh.url, payload, status, error, duration),
  ]);

  return {
    success: status >= 200 && status < 300 && !error,
    status,
    error,
    duration_ms: duration,
  };
}

// HUB CRM contact API fields (API_CONTACT_INTEGRATION.md) the payload did not have, added at
// the top level next to the old fields. customFieldRequests: field key = payload field name, so a
// field created in HUB CRM with that key fills itself; keys HUB CRM does not have are ignored.
// Missing values are sent empty (HUB CRM keeps the old value).
const HUBCRM_CUSTOM_FIELDS = [
  'page_id', 'attendance', 'region', 'interest', 'registered_at', 'utm_channel', 'ttclid', 'msclkid', 'ga',
  ...['ft', 'lt'].flatMap(p => ['source', 'medium', 'campaign', 'content', 'term', 'landing_path', 'referrer_host', 'at'].map(k => `${p}_${k}`)),
  'contact_id', 'is_new_contact', 'is_new_funnel',
  'payment_ref', 'payment_amount', 'payment_status',
  'zoom_title', 'zoom_starts_at', 'zoom_join_page_url',
];

// Runs on the final payload, after the routes added person, payment and Zoom fields.
function withHubcrmCustomFields(payload) {
  const source = {
    ...payload,
    utm_channel: payload.utm?.channel,
    zoom_title: payload.zoom?.title,
    zoom_starts_at: payload.zoom?.starts_at,
    zoom_join_page_url: payload.zoom?.join_page_url,
  };
  const customFieldRequests = HUBCRM_CUSTOM_FIELDS.map(customFieldId => ({ customFieldId, value: source[customFieldId] == null ? '' : String(source[customFieldId]) }));
  return { ...payload, customFieldRequests };
}

async function fireWebhooks(payload) {
  const webhooks = await getWebhooks();
  const active = webhooks.filter(w => w.active);
  if (!active.length) return;

  const body = withHubcrmCustomFields(payload);
  await Promise.allSettled(active.map(wh => postWebhook(wh, body)));
}

// HUB CRM funnel tracking script cookies (API_CONTACT_INTEGRATION.md 1b). Set on the landing
// domain, so /api/register and the other lead routes receive them; empty until the script is on the page.
const HUBCRM_COOKIES = { visitor_id: '_vinmoc_visitor_id', session_id: '_vinmoc_session_id', attribution_token: '_vinmoc_attribution' };

function hubcrmTracking(req) {
  const header = req?.headers?.cookie || '';
  return Object.fromEntries(Object.entries(HUBCRM_COOKIES).map(([key, name]) => {
    const m = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
    let value = '';
    try { value = m ? decodeURIComponent(m[1]) : ''; } catch { value = m[1]; }
    return [key, value.slice(0, 4096)];
  }));
}

// "Online" is not a city: the IP city is used then.
function hubcrmFields(record, tracking = {}) {
  const region = String(record.region || '').trim();
  const geo = record.geo || {};
  return {
    username: record.name || '',
    city: region && !/^online$/i.test(region) ? region : (record.city || geo.city || ''),
    nationality: geo.country_code === 'VN' ? 'Viet Nam' : (geo.country || ''),
    referal: record.referrer || '',
    original_url: record.event_source_url || '',
    visitor_id: tracking.visitor_id || '',
    session_id: tracking.session_id || '',
    attribution_token: tracking.attribution_token || '',
  };
}

// options.hubcrm: hubcrmTracking(req) of the request that created the lead.
function buildWebhookPayload(record, options = {}) {
  return {
    // First/last touch (src/attribution.js): ft_source, ft_campaign, ft_at... lt_source...
    ...flatTouch('ft', record.first_touch),
    ...flatTouch('lt', record.last_touch),
    event: 'new_registration',
    event_id: record.id,
    event_source: record.page_id || 'default',
    page_id: record.page_id || 'default',
    timestamp: new Date().toISOString(),
    registered_at: record.registered_at || '',
    name: record.name || '',
    phone: record.phone || '',
    email: record.email || '',
    region: record.region || '',
    interest: record.interest || '',
    attendance: record.attendance || '',
    event_source_url: record.event_source_url || '',
    value: record.value ?? '',
    currency: record.currency || '',
    utm_source: record.utm_source || '',
    utm_medium: record.utm_medium || '',
    utm_campaign: record.utm_campaign || '',
    utm_content: record.utm_content || '',
    utm_term: record.utm_term || '',
    referrer: record.referrer || '',
    fbclid: record.fbclid || '',
    gclid: record.gclid || '',
    ttclid: record.ttclid || '',
    msclkid: record.msclkid || '',
    twclid: record.twclid || '',
    fbc: record.fbc || '',
    fbp: record.fbp || '',
    ga: record.ga || '',
    // Messenger page and person from the customer-care bot link (?fb_page_id=&fb_id=).
    fb_page_id: record.fb_page_id || '',
    fb_id: record.fb_id || '',
    ip: record.ip || '',
    user_agent: record.user_agent || '',
    contact: {
      name: record.name,
      phone: record.phone,
      email: record.email || '',
      region: record.region || '',
      interest: record.interest || '',
      attendance: record.attendance || ''
    },
    utm: {
      source: record.utm_source || '',
      medium: record.utm_medium || '',
      campaign: record.utm_campaign || '',
      content: record.utm_content || '',
      term: record.utm_term || '',
      channel: classifyChannel(record.utm_source, record.utm_medium, record.referrer),
      referrer: record.referrer || ''
    },
    click_ids: {
      fbclid: record.fbclid || '',
      gclid: record.gclid || '',
      ttclid: record.ttclid || '',
      msclkid: record.msclkid || '',
      twclid: record.twclid || ''
    },
    pixel: {
      fbc: record.fbc || '',
      fbp: record.fbp || '',
      ga: record.ga || ''
    },
    server: {
      ip: record.ip || '',
      user_agent: record.user_agent || ''
    },
    ...hubcrmFields(record, options.hubcrm)
  };
}

module.exports = { fireWebhooks, buildWebhookPayload, withHubcrmCustomFields, hubcrmTracking, postWebhook };
