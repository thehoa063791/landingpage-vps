import type { NextApiRequest, NextApiResponse } from 'next';
import { proxyAdmin } from '@/lib/adminProxy';
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ success:false }); }
  return proxyAdmin(req,res,'register');
}
