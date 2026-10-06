const express = require('express');
const { adminAuth, requireRole } = require('../utils');
const { getAdminService } = require('../dongTienAdmin');

function createRouter(service = getAdminService(), auth = adminAuth, edit = requireRole('admin')) {
  const router = express.Router();
  router.use(auth);
  const run = fn => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(await fn(req)); }
    catch (error) { console.error('[dong-tien-admin]', error.message); res.status(error.status || 503).json({ error: error.status ? error.message : 'Không tải hoặc lưu được dữ liệu học tập.' }); }
  };
  router.get('/', run(req => service.report(req.query)));
  router.get('/vimeo-catalog', edit, run(() => service.vimeoCatalog()));
  router.post('/vimeo-import', edit, run(req => service.importVideos(req.body.ids, req.body)));
  router.post('/lessons/assign', edit, run(req => service.assignLessons(req.body.ids, req.body.stage_id)));
  for (const [kind, save] of [['lessons', service.saveLesson], ['stages', service.saveStage]]) {
    router.post(`/${kind}`, edit, run(req => save(null, req.body)));
    router.post(`/${kind}/reorder`, edit, run(req => service.reorder(kind, req.body.ids)));
    router.patch(`/${kind}/:id`, edit, run(req => save(Number(req.params.id), req.body)));
    router.delete(`/${kind}/:id`, edit, run(req => service.remove(kind, Number(req.params.id))));
  }
  return router;
}
module.exports = createRouter();
module.exports.createRouter = createRouter;
