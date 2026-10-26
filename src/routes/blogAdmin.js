// Admin > Blog API (docs/blog-seo-plan.md §6), mounted at /admin/blog for admins only
// (src/routes/admin.js). The work is in src/blog/admin.js.
const express = require('express');
const multer = require('multer');
const { getBlogAdmin } = require('../blog/admin');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 3 } });

function createRouter({ blog = getBlogAdmin } = {}) {
  const router = express.Router();
  const run = fn => (req, res) => Promise.resolve(fn(req, res)).then(result => { if (!res.headersSent) res.json(result ?? { success: true }); })
    .catch(error => {
      if (!error.status) { console.error('[blog-admin]', error); return res.status(500).json({ error: 'Lỗi hệ thống.' }); }
      res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}), ...(error.checks ? { checks: error.checks } : {}) });
    });
  const by = req => req.adminUser?.email || '';

  router.get('/posts', run(req => blog().listPosts({ status: req.query.status, category: req.query.category, q: req.query.q, page: req.query.page })));
  router.post('/posts', run(req => blog().createPost({ title: req.body?.title })));
  router.get('/posts/:id', run(req => blog().getPost(req.params.id)));
  router.put('/posts/:id', run(req => blog().savePost(req.params.id, req.body?.post || {}, { action: req.body?.action || 'save', expectedVersion: req.body?.expected_version, by: by(req) })));
  router.put('/posts/:id/draft', run(req => blog().autosave(req.params.id, req.body?.draft)));
  router.delete('/posts/:id/draft', run(req => blog().discardDraft(req.params.id)));
  router.delete('/posts/:id', run(req => blog().removePost(req.params.id)));
  router.get('/posts/:id/revisions', run(req => blog().revisions(req.params.id)));
  router.get('/posts/:id/revisions/:revision', run(req => blog().revision(req.params.id, req.params.revision)));
  router.post('/posts/:id/preview', run(req => ({ url: `/blog/xem-truoc/${blog().previewToken(req.params.id)}` })));

  router.get('/keyword-usage', run(async req => ({ used_by: await blog().keywordUsage(req.query.keyword, req.query.exclude) })));
  router.get('/links', run(req => blog().linkSearch(req.query.q)));
  router.post('/images', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'w640', maxCount: 1 }, { name: 'w1280', maxCount: 1 }]), run(req => blog().saveImage(req.files || {}, req.body || {})));

  router.get('/categories', run(() => blog().categories()));
  router.post('/categories', run(req => blog().saveCategory(null, req.body || {})));
  router.put('/categories/:id', run(req => blog().saveCategory(req.params.id, req.body || {})));
  router.delete('/categories/:id', run(req => blog().removeCategory(req.params.id)));

  router.get('/tags', run(() => blog().tags()));
  router.put('/tags/:id', run(req => blog().saveTag(req.params.id, req.body || {})));
  router.post('/tags/:id/merge', run(req => blog().mergeTag(req.params.id, req.body?.into)));
  router.delete('/tags/:id', run(req => blog().removeTag(req.params.id)));

  router.get('/authors', run(() => blog().authors()));
  router.post('/authors', run(req => blog().saveAuthor(null, req.body || {})));
  router.put('/authors/:id', run(req => blog().saveAuthor(req.params.id, req.body || {})));
  router.delete('/authors/:id', run(req => blog().removeAuthor(req.params.id)));

  return router;
}

module.exports = { createRouter };
