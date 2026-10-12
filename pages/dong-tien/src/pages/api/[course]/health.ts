import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  return res.status(200).json({
    status: "ok",
    app: "next-dong-tien",
    timestamp: new Date().toISOString(),
  });
}
