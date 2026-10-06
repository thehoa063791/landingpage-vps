import type { NextApiRequest, NextApiResponse } from 'next';

export async function proxyAdmin(req: NextApiRequest, res: NextApiResponse, path: string, binary: boolean | 'script' = false) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const admin = new URL(process.env.ADMIN_API_URL || 'http://127.0.0.1:3001');
    const host = admin.hostname;
    const privateHost = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\]|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/.test(host);
    if (!privateHost || !['http:', 'https:'].includes(admin.protocol) || admin.username || admin.password) throw new Error('Admin service must use an internal address');
    const response = await fetch(new URL(`/api/dong-tien/${path}`, admin), {
      method: req.method,
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': req.headers['user-agent'] || '',
        ...(process.env.LEAD_API_KEY ? { 'X-API-Key': process.env.LEAD_API_KEY } : {}),
        ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
        ...(req.headers['x-forwarded-for'] ? { 'X-Forwarded-For': String(req.headers['x-forwarded-for']) } : {}),
      },
      ...(req.method === 'POST' ? { body: JSON.stringify(req.body || {}) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    if (binary) {
      if (!response.ok) return res.status(response.status).end();
      const contentType = response.headers.get('content-type') || '';
      if (binary === 'script' ? !/(?:javascript)/.test(contentType) : !/^image\/(jpeg|png|webp)(;|$)/.test(contentType)) throw new Error('Invalid asset');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', binary === 'script' ? 'no-cache' : 'public, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.status(200).send(Buffer.from(await response.arrayBuffer()));
    }
    return res.status(response.status).json(await response.json());
  } catch {
    return res.status(502).json({ success: false, message: 'Không kết nối được hệ thống admin. Vui lòng thử lại.' });
  }
}
