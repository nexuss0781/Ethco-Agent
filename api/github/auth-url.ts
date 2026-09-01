import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const configured = Boolean(clientId && process.env.GITHUB_CLIENT_SECRET);
  
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const origin = process.env.APP_URL || `${proto}://${host}`;
  const redirectUri = `${origin}/api/github/callback`;
  const state = Math.random().toString(36).substring(2, 15);

  const authUrl = clientId
    ? `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent("repo,read:user,user:email")}&state=${state}`
    : "";

  res.json({
    url: authUrl,
    configured,
    redirectUri,
    hasTokenConfigured: Boolean(process.env.GITHUB_TOKEN || process.env.GIT_GH),
  });
}
