const { getWebhooks, updateWebhookMeta, insertWebhookLog } = require('./storage');
const { classifyChannel } = require('./utils');
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

async function fireWebhooks(payload) {
  const webhooks = await getWebhooks();
  const active = webhooks.filter(w => w.active);
  if (!active.length) return;

  await Promise.allSettled(active.map(wh => postWebhook(wh, payload)));
}

function buildWebhookPayload(record) {
  return {
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
    }
  };
}

module.exports = { fireWebhooks, buildWebhookPayload, postWebhook };
