import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../server.ts";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-omniroute-key");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // If slug is parsed by Vercel catch-all, reconstruct the endpoint path
  if (req.query?.slug) {
    const slugParts = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug];
    const resolvedPath = `/api/${slugParts.join("/")}`;
    req.url = resolvedPath;
    (req as any).originalUrl = resolvedPath;
  }

  return app(req, res);
}
