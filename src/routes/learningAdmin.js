const express = require('express');
const { adminAuth, requireRole } = require('../utils');
const { getAdminService } = require('../learningAdmin');
const { isCourse } = require('../learningCourses');

// Mounted at /admin/funnels/:course/learning. Tests pass one service object.
function createRouter(services = getAdminService, auth = adminAuth, edit = requireRole('admin')) {
  const router = express.Router({ mergeParams: true });
  router.use(auth);
  router.use((req, res, next) => {
    if (typeof services === 'function' && !isCourse(req.params.course)) return res.status(404).json({ error: 'Funnel này không có khóa học.' });
    req.learningAdmin = typeof services === 'function' ? services(req.params.course) : services;
    next();
  });
  const run = fn => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(await fn(req, req.learningAdmin)); }
    catch (error) { console.error('[learning-admin]', error.message); res.status(error.status || 503).json({ error: error.status ? error.message : 'Không tải hoặc lưu được dữ liệu học tập.' }); }
  };
  router.get('/', run((req, service) => service.report(req.query)));
  router.get('/vimeo-catalog', edit, run((req, service) => service.vimeoCatalog()));
  router.post('/vimeo-import', edit, run((req, service) => service.importVideos(req.body.ids, req.body)));
  router.post('/thumbnails/refresh', edit, run((req, service) => service.refreshThumbnails()));
  router.post('/lessons/assign', edit, run((req, service) => service.assignLessons(req.body.ids, req.body.stage_id)));
  router.get('/ctas', run((req, service) => service.ctas()));
  router.post('/ctas', edit, run((req, service) => service.saveCta(null, req.body)));
  router.patch('/ctas/:id', edit, run((req, service) => service.saveCta(String(req.params.id), req.body)));
  router.delete('/ctas/:id', edit, run((req, service) => service.removeCta(String(req.params.id))));
  for (const [kind, save] of [['lessons', 'saveLesson'], ['stages', 'saveStage']]) {
    router.post(`/${kind}`, edit, run((req, service) => service[save](null, req.body)));
    router.post(`/${kind}/reorder`, edit, run((req, service) => service.reorder(kind, req.body.ids)));
    router.patch(`/${kind}/:id`, edit, run((req, service) => service[save](Number(req.params.id), req.body)));
    router.delete(`/${kind}/:id`, edit, run((req, service) => service.remove(kind, Number(req.params.id))));
  }
  return router;
}
module.exports = createRouter();
module.exports.createRouter = createRouter;
