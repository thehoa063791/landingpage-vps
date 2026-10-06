const express = require('express');
const crypto = require('crypto');
const { getLearningService } = require('../dongTienLearning');
const { extractClientIp } = require('../utils');
const { thumbnailDirectory, thumbnailName } = require('../dongTienVimeo');
const path = require('node:path');

function createRouter(service = getLearningService()) {
  const router = express.Router();
  router.get('/project/config', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(require('../trackingConfig').browserTrackingConfig());
  });
  router.get('/project/:asset', (req, res) => {
    if (!['funnel-tracker', 'meta-pixel'].includes(req.params.asset)) return res.sendStatus(404);
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.resolve(__dirname, '../../public/js', `${req.params.asset}.js`));
  });
  router.get('/thumbnails/:filename', (req, res) => {
    if (!thumbnailName.test(req.params.filename)) return res.sendStatus(404);
    res.sendFile(path.join(thumbnailDirectory(), req.params.filename), { maxAge: '365d', immutable: true }, error => { if (error && !res.headersSent) res.sendStatus(error.statusCode || 404); });
  });
  const buckets = new Map();
  const context = req => ({ ip: extractClientIp(req), user_agent: req.headers['user-agent'] || '', url: req.body?.event_source_url || '', session_id: req.body?.session_id || '' });
  const wrap = fn => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(await fn(req)); }
    catch (error) {
      if (!error.status) console.error('[dong-tien]', error.code || error.message);
      res.status(error.status || 503).json({ success: false, message: error.status ? error.message : 'Không lưu được dữ liệu học tập. Vui lòng thử lại.' });
    }
  };
  router.use((req, res, next) => {
    const expected = process.env.LEAD_API_KEY;
    if (expected) {
      const actual = Buffer.from(String(req.headers['x-api-key'] || '')), wanted = Buffer.from(expected);
      if (actual.length !== wanted.length || !crypto.timingSafeEqual(actual, wanted)) return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    next();
  });
  function authRateLimit(req, res, next) {
    const ip = extractClientIp(req), now = Date.now();
    if (buckets.size > 10000) for (const [key, value] of buckets) if (value.until < now) buckets.delete(key);
    const bucket = buckets.get(ip);
    if (!bucket || bucket.until < now) buckets.set(ip, { until: now + 60000, count: 1 });
    else if (++bucket.count > 30) return res.status(429).json({ success: false, message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau một phút.' });
    next();
  }
  // Browser Pixel/GTM only; registration and events remain in the internal CRM.
  router.post('/register', authRateLimit, wrap(req => service.register(req.body || {}, context(req))));
  router.post('/login', authRateLimit, wrap(req => service.login(req.body || {}, context(req))));
  router.post('/track', wrap(async req => {
    const body = req.body || {}, data = body.data || {}, bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const lead = bearer ? await service.authenticate(bearer) : null;
    if (!['pageview','form_open','form_submit','cta_click','sale_click','scroll_depth','time_on_page','exit_intent','conversion','view_content'].includes(body.event)) {
      const error = new Error('Sự kiện không hợp lệ.'); error.status = 400; throw error;
    }
    if (body.event === 'view_content' && !lead) { const error = new Error('Vui lòng đăng nhập.'); error.status = 401; throw error; }
    // Conversion is written once when the CRM lead is created.
    const tracking = { ...data, ...(body.tracking?.utm || {}), ...(body.tracking?.click_ids || {}), ...(body.tracking?.pixel || {}), ...(body.meta || {}), page_id: 'dong-tien', event_id: String(body.event_id || data.event_id || '').slice(0,200), url: String(body.tracking?.event_source_url || data.url || '').slice(0,2048) };
    if (body.event !== 'conversion') {
      await service.event(body.event === 'view_content' ? 'lesson_view' : body.event, lead, tracking, { ...context(req), event_id: tracking.event_id, session_id: String(body.tracking?.session_id || body.session_id || '').slice(0,200), url: tracking.url });
    }
    return { success: true, event_id: body.event_id };
  }));
  router.use(async (req, res, next) => {
    try {
      req.learningLead = await service.authenticate(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      next();
    } catch (error) { res.status(error.status || 503).json({ success: false, message: error.message }); }
  });
  router.get('/profile', wrap(req => service.profile(req.learningLead)));
  router.get('/lessons', wrap(req => service.lessons(req.learningLead)));
  router.post('/position', wrap(req => service.updatePosition(req.learningLead, req.body || {})));
  router.post('/survey', wrap(req => service.submitSurvey(req.learningLead, req.body || {}, context(req))));
  router.post('/complete-tour', wrap(req => service.completeTour(req.learningLead)));
  router.get('/courses/1/completion-status', wrap(req => service.completion(req.learningLead)));
  router.get('/videos/:id/progress', wrap(req => service.getProgress(req.learningLead, req.params.id)));
  router.post('/videos/:id/progress', wrap(req => service.saveProgress(req.learningLead, req.params.id, req.body || {}, context(req))));
  router.get('/videos/:id/state', wrap(async req => {
    const p = await service.getProgress(req.learningLead, req.params.id);
    return { lesson_id: p.lesson_id, current_position: p.last_position, duration: p.duration, is_completed: p.is_completed, should_resume: !p.is_completed && p.last_position > 5, resume_position: p.last_position };
  }));
  return router;
}
module.exports = createRouter();
module.exports.createRouter = createRouter;
