import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const projectId = process.env.NEXUSS_AUTH_PROJECT_ID || "ethco-agents";
  const authUrl = process.env.NEXUSS_AUTH_URL || "https://nexuss-auth.vercel.app";

  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const defaultAppUrl = process.env.NODE_ENV === "production" ? "https://ethco-agent.vercel.app" : `${proto}://${host}`;
  const origin = process.env.APP_URL || defaultAppUrl;
  const redirectUri = `${origin}/api/auth/callback`;

  // Central GitHub repository authorization flow via Nexuss Auth (Section 12 of INTEGRATION.md)
  const targetUrl = `${authUrl}/oauth/start/github?project_id=${encodeURIComponent(projectId)}&redirect_uri=${encodeURIComponent(redirectUri)}&handoff=1&purpose=github_authorization`;

  res.json({
    url: targetUrl,
    configured: true,
    redirectUri,
  });
}

