import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

const STATE_COOKIE = "ethco_github_oauth_state";
const STATE_TTL_SECONDS = 10 * 60;

function getAppOrigin(req: VercelRequest): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = forwardedProto || (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  if (!clientId || !process.env.GITHUB_CLIENT_SECRET?.trim()) {
    return res.status(500).send("GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.");
  }

  const state = crypto.randomBytes(32).toString("hex");
  const redirectUri = `${getAppOrigin(req)}/api/github/callback`;
  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "read:user user:email repo");
  authorizeUrl.searchParams.set("state", state);

  const secure = process.env.NODE_ENV === "production" || redirectUri.startsWith("https://");
  const cookie = `${STATE_COOKIE}=${state}; Path=/; Max-Age=${STATE_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  res.setHeader("Set-Cookie", cookie);
  return res.redirect(302, authorizeUrl.toString());
}

export { STATE_COOKIE, getAppOrigin };
