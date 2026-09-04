const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { getWebhooks, getWebhookById, upsertWebhook, deleteWebhook } = require('../storage');
const { wrap, adminAuth, requireRole } = require('../utils');
const { postWebhook } = require('../webhooks');

router.use(adminAuth, requireRole('admin'));

// GET /admin/webhooks
router.get('/', wrap(async (req, res) => {
  res.json(await getWebhooks());
}));

// POST /admin/webhooks
router.post('/', wrap(async (req, res) => {
  const { name, url, active } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name và url là bắt buộc.' });
  try { new URL(url); } catch { return res.status(400).json({ error: 'URL không hợp lệ.' }); }
  const wh = {
    id: crypto.randomUUID(), name: name.trim(), url: url.trim(),
    active: active !== false, created_at: new Date().toISOString(),
    last_triggered: null, last_status: null, last_error: null
  };
  await upsertWebhook(wh);
  res.json(wh);
}));

// PUT /admin/webhooks/:id
router.put('/:id', wrap(async (req, res) => {
  const wh = await getWebhookById(req.params.id);
  if (!wh) return res.status(404).json({ error: 'Không tìm thấy webhook.' });
  const { name, url, active } = req.body;
  if (url) { try { new URL(url); } catch { return res.status(400).json({ error: 'URL không hợp lệ.' }); } }
  if (name)             wh.name   = name.trim();
  if (url)              wh.url    = url.trim();
  if (active !== undefined) wh.active = Boolean(active);
  wh.updated_at = new Date().toISOString();
  await upsertWebhook(wh);
  res.json(wh);
}));

// DELETE /admin/webhooks/:id
router.delete('/:id', wrap(async (req, res) => {
  const wh = await getWebhookById(req.params.id);
  if (!wh) return res.status(404).json({ error: 'Không tìm thấy webhook.' });
  await deleteWebhook(req.params.id);
  res.json({ success: true });
}));

// POST /admin/webhooks/:id/test
router.post('/:id/test', wrap(async (req, res) => {
  const wh = await getWebhookById(req.params.id);
  if (!wh) return res.status(404).json({ error: 'Không tìm thấy webhook.' });

  const testPayload = {
    event: 'new_registration',
    timestamp: new Date().toISOString(),
    contact: { name: 'Nguyễn Test', phone: '0901234567', email: 'test@example.com', region: 'Hà Nội', attendance: 'Online qua Zoom' },
    utm: { source: 'facebook', medium: 'cpc', campaign: 'test-campaign', content: '', term: '', channel: 'Paid Search', referrer: '' },
    click_ids: { fbclid: 'IwAR2_test123', gclid: '', ttclid: '', msclkid: '', twclid: '' },
    pixel: { fbc: 'fb.1.1713340200000.IwAR2_test123', fbp: 'fb.1.1713000000000.987654321', ga: 'GA1.1.123456789.1713000000' },
    server: { ip: '1.2.3.4', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15' }
  };

  const result = await postWebhook(wh, testPayload, { source: 'landingpage-test', timeoutMs: 8000 });
  res.json(result);
}));

module.exports = router;
