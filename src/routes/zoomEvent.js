const express = require('express');
const { getZoomEventService, PAGE_ID } = require('../zoomEvent');
const { adminAuth, requireRole, extractClientIp } = require('../utils');

const TRACKING_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer', 'fbclid', 'gclid'];
const context = req => ({
  ip: extractClientIp(req),
  user_agent: req.headers['user-agent'] || '',
  url: String(req.body?.event_source_url || ''),
  session_id: String(req.body?.session_id || ''),
  tracking: Object.fromEntries(TRACKING_KEYS.map(key => [key, String(req.body?.[key] || '').slice(0, 500)]).filter(([, value]) => value)),
  request: req,
});

function run(fn, { publicErrors = true } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(await fn(req, getZoomEventService())); }
    catch (error) {
      if (!error.status) console.error('[zoom-event]', error.message);
      res.status(error.status || 503).json({ success: false, ...(publicErrors ? { message: error.status ? error.message : 'Hệ thống đang bận. Vui lòng thử lại.' } : { error: error.status ? error.message : 'Không tải hoặc lưu được dữ liệu sự kiện Zoom.' }), ...(error.status && error.code ? { code: error.code } : {}) });
    }
  };
}

// Public API used by pages/zoom-event. Same per-IP limit as the course login forms.
function createPublicRouter() {
  const router = express.Router();
  const buckets = new Map();
  function limit(req, res, next) {
    const ip = extractClientIp(req), now = Date.now();
    if (buckets.size > 10000) for (const [key, value] of buckets) if (value.until < now) buckets.delete(key);
    const bucket = buckets.get(ip);
    if (!bucket || bucket.until < now) buckets.set(ip, { until: now + 60000, count: 1 });
    else if (++bucket.count > 20) return res.status(429).json({ success: false, message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.' });
    next();
  }
  router.post('/check', limit, run((req, service) => service.check(req.body || {}, context(req))));
  router.post('/complete', limit, run((req, service) => service.complete(req.body || {}, context(req))));
  router.get('/session/:key', run((req, service) => service.session(req.params.key)));
  return router;
}

function createAdminRouter() {
  const router = express.Router();
  const edit = requireRole('admin');
  const opts = { publicErrors: false };
  router.use(adminAuth);
  router.get('/settings', run(async (req, service) => ({ page_id: PAGE_ID, settings: await service.settings() }), opts));
  router.put('/settings', edit, run(async (req, service) => ({ success: true, settings: await service.saveSettings(req.body || {}) }), opts));
  router.get('/report', run((req, service) => service.report(req.query), opts));
  router.post('/zoom-check', edit, run((req, service) => service.zoomCheck(req.body), opts));
  router.post('/retry-links', edit, run((req, service) => service.retryLinks(), opts));
  router.post('/zoom-enable', edit, run((req, service) => service.enableRegistration(req.body), opts));
  return router;
}

module.exports = { createPublicRouter, createAdminRouter };
