const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Đọc cookie từ request header – fallback khi client không gửi qua body
function reqCookie(req, name) {
  const header = req.headers.cookie || '';
  const m = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function normalizePhoneKey(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('0084')) digits = digits.slice(2);
  if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  return digits;
}

function compactLineParts(parts = []) {
  return parts.map(v => String(v || '').trim()).filter(Boolean).join(' | ');
}

const {
  supabase,
  countRegistrationsByPage,
  insertRegistration,
  insertEvent,
  insertSurvey,
  tagLeadByPage,
  addLeadNote,
} = require('../storage');
const { wrap, parseUA, lookupGeo, extractClientIp } = require('../utils');
const { fireWebhooks, buildWebhookPayload } = require('../webhooks');
const { sendTrackEvent, sendRegistrationEvents } = require('../metaCapi');
const { registerEverWebinar } = require('../webinarService');

const CMS_MEDIA_BUCKET = 'cms-media';
const WORKSHOP_FEEDBACK_FOLDER = 'feedback-capture';
const PUBLIC_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const recentPageviews = new Map();

function safeTrim(value) {
  return String(value ?? '').trim();
}

function validIsoOrNow(value) {
  const d = new Date(value || '');
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function isPublicImageFile(item) {
  if (!item || item.id === null || item.name === '.emptyFolderPlaceholder') return false;
  const mime = item.metadata?.mimetype || '';
  if (PUBLIC_IMAGE_TYPES.has(mime)) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(item.name || '');
}

function publicMediaUrl(path) {
  const { data } = supabase.storage.from(CMS_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

function verifyLeadApiKey(req, res, next) {
  const expected = safeTrim(process.env.LEAD_API_KEY);
  if (!expected) return next();

  const auth = safeTrim(req.headers.authorization);
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const provided = bearer || safeTrim(req.headers['x-api-key']);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  return res.status(401).json({ success: false, message: 'Unauthorized' });
}

function unwrapLeadPayload(item) {
  if (item?.body && typeof item.body === 'object') return item.body;
  return item || {};
}

function mapExternalLeadPayload(item, req) {
  const body = unwrapLeadPayload(item);
  const contact = body.contact || {};
  const utm = body.utm || {};
  const clickIds = body.click_ids || {};
  const pixel = body.pixel || {};
  const server = body.server || {};

  const phone = safeTrim(contact.phone || body.phone);
  const email = safeTrim(contact.email || body.email).toLowerCase();
  const name = safeTrim(contact.name || body.name || phone || email);
  const registeredAt = validIsoOrNow(body.timestamp || body.registered_at);
  const userAgent = safeTrim(server.user_agent || body.user_agent || req.headers['user-agent']);
  const ip = safeTrim(server.ip || body.ip || extractClientIp(req));

  return {
    id: crypto.randomUUID(),
    name,
    phone,
    email,
    region: safeTrim(contact.region || body.region),
    interest: safeTrim(contact.interest || body.interest),
    attendance: safeTrim(contact.attendance || body.attendance),
    utm_source: safeTrim(utm.source || body.utm_source),
    utm_medium: safeTrim(utm.medium || body.utm_medium),
    utm_campaign: safeTrim(utm.campaign || body.utm_campaign),
    utm_content: safeTrim(utm.content || body.utm_content),
    utm_term: safeTrim(utm.term || body.utm_term),
    referrer: safeTrim(utm.referrer || body.referrer),
    fbclid: safeTrim(clickIds.fbclid || body.fbclid),
    gclid: safeTrim(clickIds.gclid || body.gclid),
    ttclid: safeTrim(clickIds.ttclid || body.ttclid),
    msclkid: safeTrim(clickIds.msclkid || body.msclkid),
    twclid: safeTrim(clickIds.twclid || body.twclid),
    fbc: safeTrim(pixel.fbc || body.fbc),
    fbp: safeTrim(pixel.fbp || body.fbp),
    ga: safeTrim(pixel.ga || body.ga),
    page_id: safeTrim(body.event_source || body.page_id || req.query.page_id) || 'external',
    session_id: safeTrim(body.event_id || body.session_id),
    ip,
    user_agent: userAgent,
    event_source_url: safeTrim(body.event_source_url || item?.webhookUrl || body.webhookUrl),
    device: parseUA(userAgent),
    geo: null,
    registered_at: registeredAt,
    external_event: safeTrim(body.event || 'new_lead'),
    external_event_id: safeTrim(body.event_id),
    external_source: safeTrim(body.event_source),
    utm_channel: safeTrim(utm.channel),
    raw_payload: item,
  };
}

function validateExternalLead(record) {
  if (!record.phone && !record.email) {
    return 'Lead can co phone hoac email.';
  }
  const phoneClean = record.phone.replace(/\D/g, '');
  if (record.phone && (phoneClean.length < 9 || phoneClean.length > 15)) {
    return 'So dien thoai khong hop le.';
  }
  if (record.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) {
    return 'Email khong hop le.';
  }
  return '';
}

async function upsertExternalLead(record) {
  const now = new Date().toISOString();
  await insertRegistration(record);
  await tagLeadByPage(record).catch(err => console.warn('[api/leads] page tag sync failed:', err.message));
  await insertEvent({
    event: record.external_event || 'external_lead',
    event_id: record.external_event_id || record.id,
    session_id: record.session_id || '',
    ip: record.ip,
    timestamp: record.registered_at || now,
    data: { page_id: record.page_id, source: 'external_api' }
  }).catch(() => {});
  return { id: record.id, duplicate: false };
}

// GET /api/meta-config
router.get('/meta-config', wrap(async (req, res) => {
  const pixelId = process.env.META_DATASET_ID || process.env.FB_PIXEL_ID || '';
  res.json({
    enabled: process.env.META_CAPI_ENABLED !== 'false' && !!pixelId,
    pixel_id: pixelId,
  });
}));

// GET /api/workshop-feedback
router.get('/workshop-feedback', wrap(async (req, res) => {
  const { data, error } = await supabase.storage
    .from(CMS_MEDIA_BUCKET)
    .list(WORKSHOP_FEEDBACK_FOLDER, {
      limit: 500,
      sortBy: { column: 'created_at', order: 'desc' },
    });

  if (error) return res.status(500).json({ success: false, message: error.message, images: [] });

  const images = (data || [])
    .filter(isPublicImageFile)
    .map(item => {
      const path = `${WORKSHOP_FEEDBACK_FOLDER}/${item.name}`;
      return {
        name: item.name,
        path,
        url: publicMediaUrl(path),
        created_at: item.created_at || '',
      };
    });

  res.json({ success: true, images });
}));

// POST /api/leads
router.post('/leads', verifyLeadApiKey, wrap(async (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  if (!items.length) return res.status(400).json({ success: false, message: 'Payload rong.' });

  const results = [];
  for (const item of items) {
    const record = mapExternalLeadPayload(item, req);
    const error = validateExternalLead(record);
    if (error) {
      results.push({ success: false, message: error, event_id: record.external_event_id || '' });
      continue;
    }
    const saved = await upsertExternalLead(record);
    results.push({
      success: true,
      event_id: saved.id,
      duplicate: saved.duplicate,
      external_event_id: record.external_event_id || '',
    });
  }

  const failed = results.filter(r => !r.success);
  const status = failed.length === 0 ? 200 : failed.length === results.length ? 400 : 207;
  res.status(status).json({
    success: failed.length === 0,
    created: results.filter(r => r.success && !r.duplicate).length,
    updated: results.filter(r => r.success && r.duplicate).length,
    failed: failed.length,
    results,
  });
}));

// POST /api/register
router.post('/register', wrap(async (req, res) => {
  const {
    name, phone, email, region, interest, attendance,
    utm_source, utm_medium, utm_campaign, utm_content, utm_term,
    referrer, session_id, page_id,
    fbclid, gclid, ttclid, msclkid, twclid,
    fbc, fbp, ga, event_source_url, value, currency,
    webinar_provider
  } = req.body;

  const quizPage = (page_id || '').startsWith('tt14n-quiz');
  const webinarSignup = String(webinar_provider || '').toLowerCase() === 'everwebinar';
  if (!name || (!phone && !quizPage && !webinarSignup))
    return res.status(400).json({ success: false, message: 'Vui lòng điền họ tên và số điện thoại.' });

  const phoneClean = (phone || '').replace(/\D/g, '');
  if (!quizPage && !webinarSignup && (phoneClean.length < 9 || phoneClean.length > 11))
    return res.status(400).json({ success: false, message: 'Số điện thoại không hợp lệ.' });

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return res.status(400).json({ success: false, message: 'Vui lòng nhập email hợp lệ.' });

  const ip = extractClientIp(req);

  // Geo lookup trước để CAPI có state và zip đầy đủ
  const geo = await lookupGeo(ip).catch(() => null);
  const now = new Date().toISOString();

  const record = {
    id:           crypto.randomUUID(),
    name:         name.trim(),
    phone:        (phone || '').trim(),
    email:        email ? email.trim() : '',
    region:       region     || '',
    interest:     interest   || '',
    attendance:   attendance || '',
    utm_source:   utm_source   || '',
    utm_medium:   utm_medium   || '',
    utm_campaign: utm_campaign || '',
    utm_content:  utm_content  || '',
    utm_term:     utm_term     || '',
    referrer:     referrer     || '',
    fbclid:  fbclid  || '',
    gclid:   gclid   || '',
    ttclid:  ttclid  || '',
    msclkid: msclkid || '',
    twclid:  twclid  || '',
    fbc: fbc || reqCookie(req, '_fbc') || '',
    fbp: fbp || reqCookie(req, '_fbp') || '',
    ga:  ga  || '',
    page_id:      page_id    || 'default',
    session_id:   session_id || '',
    ip,
    user_agent:   req.headers['user-agent'] || '',
    event_source_url: event_source_url || '',
    value:        value ?? undefined,
    currency:     currency || '',
    device:       parseUA(req.headers['user-agent'] || ''),
    geo,
    city:         geo?.city   || '',
    state:        geo?.region || '',
    zip:          geo?.zip    || '',
    registered_at: now
  };

  const shouldCreateWebinarLink = webinarSignup;
  let webinar = null;
  if (shouldCreateWebinarLink) {
    try {
      webinar = await registerEverWebinar(record, { force: true });
      record.webinar = webinar;
    } catch (err) {
      console.error('[register everwebinar]', err.message, err.payload ? JSON.stringify(err.payload) : '');
      return res.status(502).json({
        success: false,
        message: err.code === 'EVERWEBINAR_NOT_CONFIGURED'
          ? 'Chua cau hinh EverWebinar trong Admin Settings.'
          : 'Khong tao duoc link vao hoc EverWebinar. Vui long thu lai hoac lien he ho tro.',
        detail: err.message,
      });
    }
  }

  await insertRegistration(record);
  await tagLeadByPage(record).catch(err => console.warn('[register] page tag sync failed:', err.message));
  await insertEvent({
    event: 'conversion', event_id: record.id,
    session_id: session_id || '', timestamp: new Date().toISOString()
  }).catch(() => {});

  await Promise.allSettled([
    sendRegistrationEvents(req, record),
    fireWebhooks(buildWebhookPayload(record)),
  ]);

  res.json({
    success: true,
    event_id: record.id,
    webinar,
    join_url: webinar?.join_url || '',
    message: webinar?.join_url
      ? 'Dang ky thanh cong! Link vao hoc cua ban da duoc tao.'
      : 'Đăng ký thành công! Chúng tôi sẽ gửi link Zoom cho bạn sớm nhất.'
  });
}));

// POST /api/track
router.post('/track', wrap(async (req, res) => {
  const { event, session_id, data } = req.body;
  if (!event) return res.status(400).json({ success: false });
  if (event === 'pageview') {
    const navigationId = String(data?.navigation_id || '');
    if (navigationId) {
      const now = Date.now();
      const seenAt = recentPageviews.get(navigationId);
      if (seenAt && now - seenAt < 10 * 60 * 1000) return res.json({ success: true, duplicate: true });
      recentPageviews.set(navigationId, now);
      if (recentPageviews.size > 5000) {
        for (const [key, timestamp] of recentPageviews) {
          if (now - timestamp > 10 * 60 * 1000) recentPageviews.delete(key);
        }
      }
    }
  }
  const trackingData = {
    ...(data || {}),
    device: data?.device || parseUA(req.headers['user-agent'] || ''),
  };
  await insertEvent({
    event,
    event_id:   data?.event_id || '',
    session_id: session_id || '',
    data:       trackingData,
    ip:         extractClientIp(req),
    timestamp:  new Date().toISOString()
  });
  if (event !== 'conversion') {
    await sendTrackEvent(req, event, trackingData).catch(() => {});
  }
  res.json({ success: true });
}));

// GET /api/validate-email?email=...
router.get('/validate-email', wrap(async (req, res) => {
  const email = (req.query.email || '').trim().toLowerCase();
  if (!email) return res.json({ valid: false, reason: 'missing' });

  const emailRegex = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) return res.json({ valid: false, reason: 'format' });

  return res.json({ valid: true });
}));

// GET /api/seats
router.get('/seats', wrap(async (req, res) => {
  const pageId        = req.query.page || 'default';
  const taken = await countRegistrationsByPage(pageId);
  res.json({ total: null, taken, remaining: null, isFull: false });
}));

// POST /api/survey
router.post('/survey', wrap(async (req, res) => {
  const { registration_id, page_id, q1, q2, q3, q4, q5, q6, q7, q8, q9 } = req.body;
  if (!q1 && !q2 && !q8) return res.status(400).json({ success: false, message: 'Thiếu dữ liệu khảo sát.' });
  await insertSurvey({ registration_id: registration_id || null, page_id: page_id || '30s-trading', q1, q2, q3, q4, q5, q6, q7, q8, q9 });
  res.json({ success: true });
}));

module.exports = router;
