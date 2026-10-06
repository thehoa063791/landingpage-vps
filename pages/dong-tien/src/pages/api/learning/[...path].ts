import type { NextApiRequest, NextApiResponse } from 'next';
import { proxyAdmin } from '@/lib/adminProxy';

const allowed = /^(login|profile|lessons|position|survey|complete-tour|courses\/1\/completion-status|videos\/[1-9]\d*\/(progress|state))$/;
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const path = Array.isArray(req.query.path) ? req.query.path.join('/') : '';
  if (/^thumbnails\/[1-9]\d*-[a-f0-9]{16}\.(jpg|png|webp)$/.test(path)) {
    if (req.method !== 'GET') return res.status(405).end();
    return proxyAdmin(req, res, path, true);
  }
  if (!allowed.test(path)) return res.status(404).json({ success: false });
  if (!['GET', 'POST'].includes(req.method || '')) return res.status(405).json({ success: false });
  return proxyAdmin(req, res, path);
}
