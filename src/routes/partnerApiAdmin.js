// Admin > Cài đặt > API đối tác, mounted at /admin/partner-api behind admin auth: the partner
// documentation (docs/PARTNER_API.md, the single source) and key management. A new or
// rotated key is returned once; listings never include keys or their hashes.
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { getClientStore, validateClientInput } = require('../partner/clients');
const { keyOptions } = require('../partner/facets');

const DOCS = path.join(__dirname, '..', '..', 'docs', 'PARTNER_API.md');
const publicClient = client => { const { key_hash, ...rest } = client; return rest; };

function createRouter({ clients = getClientStore(), options = keyOptions, docs = DOCS } = {}) {
  const router = express.Router();
  const run = fn => (req, res) => Promise.resolve().then(() => fn(req, res)).then(body => { res.setHeader('Cache-Control', 'no-store'); res.json(body); }).catch(error => {
    if (!error.status) console.error('[partner-api admin]', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Không lưu được. Vui lòng thử lại.' });
  });
  const notFound = () => Object.assign(new Error('Không tìm thấy khóa đang hoạt động.'), { status: 404 });
  const by = req => req.adminUser?.email || null;
  const validate = (body, partial) => { const known = options(); return validateClientInput(body || {}, { scopes: known.scopes.map(s => s.scope), courses: known.courses.map(c => c.id), partial }); };

  router.get('/', run(async () => {
    const [markdown, list] = await Promise.all([
      fs.readFile(docs, 'utf8'),
      clients.list().catch(error => { console.warn('[partner-api] key list unavailable:', error.message); return null; }),
    ]);
    return { markdown, clients: list && list.map(publicClient), options: options() };
  }));
  router.post('/keys', run(async req => {
    const { client, key } = await clients.create(validate(req.body, false), { by: by(req) });
    return { client: publicClient(client), key };
  }));
  router.put('/keys/:id', run(async req => {
    const client = await clients.update(req.params.id, validate(req.body, true), { by: by(req) });
    if (!client) throw notFound();
    return { client: publicClient(client) };
  }));
  router.post('/keys/:id/rotate', run(async req => {
    const result = await clients.rotate(req.params.id, { by: by(req) });
    if (!result) throw notFound();
    return { client: publicClient(result.client), key: result.key };
  }));
  router.post('/keys/:id/revoke', run(async req => {
    if (!await clients.revoke(req.params.id)) throw notFound();
    return { success: true };
  }));
  router.delete('/keys/:id', run(async req => {
    if (!await clients.remove(req.params.id)) throw Object.assign(new Error('Chỉ xóa được khóa đã thu hồi.'), { status: 409 });
    return { success: true };
  }));
  return router;
}

module.exports = { createRouter };
