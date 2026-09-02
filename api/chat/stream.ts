import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../../server.ts";

export const config = {
  maxDuration: 60,
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Ensure req.url matches the Express endpoint
  req.url = "/api/chat/stream";
  return app(req, res);
}
