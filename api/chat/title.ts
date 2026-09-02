import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../../server.ts";

export default function handler(req: VercelRequest, res: VercelResponse) {
  req.url = "/api/chat/title";
  return app(req, res);
}
