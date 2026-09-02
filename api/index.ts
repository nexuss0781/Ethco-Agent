import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../server.ts";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-omniroute-key, x-github-token");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Handle URL normalization in case Vercel rewrites altered the path
  const matched = (req.headers["x-matched-path"] as string) || (req.headers["x-forwarded-uri"] as string);
  if (matched && matched.startsWith("/api") && !req.url.startsWith("/api")) {
    req.url = matched;
    (req as any).originalUrl = matched;
  }

  return app(req, res);
}
