// Weekly webinar funnel routes. Admin > Webinar Dòng Tiền: cohorts, their Zalo groups and the
// session schedule. Public: the pages' data under /api/webinar-program.
const express = require('express');
const { getWebinarProgramService } = require('../webinarProgram');

const run = (fn, unavailable = 'Hệ thống đang bận. Vui lòng thử lại.') => async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try { res.json(await fn(req, getWebinarProgramService())); }
  catch (error) {
    if (!error.status) console.error('[webinar-program]', error.message);
    res.status(error.status || 503).json({ success: false, message: error.status ? error.message : unavailable });
  }
};

// Sales see the cohorts and their people; the schedule (Webinar IDs, direct links) and the
// key stay with admins, as do all changes.
const isAdmin = req => req.adminUser?.role === 'admin';
const adminOnly = (req, res, next) => isAdmin(req) ? next() : res.status(403).json({ success: false, message: 'Chỉ admin được sửa phần này.' });

function createRouter() {
  const router = express.Router();
  router.get('/', run(async (req, service) => {
    const view = await service.overview();
    return isAdmin(req) ? view : { ...view, settings: { title: view.settings.title, cutoff_time: view.settings.cutoff_time }, can_edit: false };
  }, 'Chưa tải được dữ liệu webinar. Vui lòng thử lại.'));
  router.get('/cohorts/:startsOn/people', run((req, service) => service.people(req.params.startsOn), 'Chưa tải được danh sách. Vui lòng thử lại.'));
  // Pull who watched from EverWebinar now (it also runs on its own); only refreshes numbers, so sales may too.
  router.post('/cohorts/:startsOn/attendance', run((req, service) => service.syncAttendance(req.params.startsOn), 'Chưa lấy được dữ liệu từ EverWebinar. Vui lòng thử lại.'));
  // Read each session's evening and hour from its webinar in EverWebinar now (also every few minutes on its own).
  router.post('/schedule-sync', adminOnly, run((req, service) => service.syncSchedule({ fresh: true }), 'Chưa đọc được lịch từ EverWebinar. Vui lòng thử lại.'));
  router.post('/test-room', adminOnly, run((req, service) => service.testRoom(req.body?.position, req.adminUser?.email)));
  router.put('/settings', adminOnly, run(async (req, service) => ({ success: true, settings: await service.saveSettings(req.body || {}) })));
  router.put('/cohorts/:startsOn', adminOnly, run(async (req, service) => ({ success: true, cohort: await service.saveCohort(req.params.startsOn, req.body || {}) })));
  return router;
}

// Same per-IP limit as /zoom's email check: an email lookup must not be scriptable.
function createPublicRouter() {
  const { extractClientIp } = require('../utils');
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
  router.get('/config', run((req, service) => service.publicConfig()));
  router.post('/check', limit, run((req, service) => service.check(req.body || {})));
  router.post('/enter', limit, run((req, service) => service.enterWeek(req.body || {})));
  router.post('/link-event', limit, run((req, service) => service.linkEvent(req.body || {})));
  router.get('/session/:key', run((req, service) => service.session(req.params.key)));
  router.post('/rejoin/:key', limit, run((req, service) => service.rejoin(req.params.key)));
  return router;
}

module.exports = { createRouter, createPublicRouter };
