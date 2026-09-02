import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../../server.ts";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-omniroute-key");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  req.url = "/api/chat/title";
  (req as any).originalUrl = "/api/chat/title";
  return app(req, res);
}
