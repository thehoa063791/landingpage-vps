import type { NextApiRequest, NextApiResponse } from 'next';
import { proxyAdmin } from '@/lib/adminProxy';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const asset = String(req.query.asset || '');
  if (!['config', 'funnel-tracker', 'meta-pixel'].includes(asset)) return res.status(404).end();
  return proxyAdmin(req, res, `project/${asset}`, asset === 'config' ? false : 'script');
}
