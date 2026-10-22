// Admin > Redirect, mounted at /admin/redirects behind admin auth: list, create, edit,
// switch on/off and delete redirects (src/redirects.js).
const express = require('express');
const { getRedirectStore, validateInput, CODES } = require('../redirects');

function createRouter({ store = getRedirectStore() } = {}) {
  const router = express.Router();
  const run = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).then(body => { res.setHeader('Cache-Control', 'no-store'); res.json(body); }).catch(error => {
    if (!error.status) console.error('[redirects admin]', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Không lưu được. Vui lòng thử lại.' });
  });
  const notFound = () => Object.assign(new Error('Không tìm thấy redirect.'), { status: 404 });
  const by = req => req.adminUser?.email || null;

  router.get('/', run(async () => {
    await store.flush();
    return { redirects: await store.list(), codes: CODES };
  }));
  router.post('/', run(async req => ({ redirect: await store.create(validateInput(req.body || {}), { by: by(req) }) })));
  router.put('/:id', run(async req => {
    const redirect = await store.update(req.params.id, validateInput(req.body || {}, { partial: true }), { by: by(req) });
    if (!redirect) throw notFound();
    return { redirect };
  }));
  router.delete('/:id', run(async req => {
    if (!await store.remove(req.params.id)) throw notFound();
    return { success: true };
  }));
  return router;
}

module.exports = { createRouter };
