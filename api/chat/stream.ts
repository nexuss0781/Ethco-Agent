import type { VercelRequest, VercelResponse } from "@vercel/node";
import app from "../../server.ts";

export const config = {
  maxDuration: 60,
};

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-omniroute-key");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      message: "Chat stream endpoint is operational. Send a POST request with messages to stream completions.",
    });
  }

  // Ensure req.url and req.originalUrl match the Express endpoint
  req.url = "/api/chat/stream";
  (req as any).originalUrl = "/api/chat/stream";
  return app(req, res);
}
