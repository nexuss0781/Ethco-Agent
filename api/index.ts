import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../server.ts";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-omniroute-key");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  return app(req, res);
}
