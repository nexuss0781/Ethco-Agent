import type { VercelRequest, VercelResponse } from "@vercel/node";

function appOrigin(req: VercelRequest): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  const proto = req.headers["x-forwarded-proto"] || (process.env.NODE_ENV === "production" ? "https" : "http");
  return `${proto}://${host}`;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const authUrl = (process.env.NEXUSS_AUTH_URL || process.env.VITE_NEXUSS_AUTH_URL || "https://nexuss-auth.vercel.app").trim().replace(/\/+$/, "");
  const projectId = (process.env.NEXUSS_AUTH_PROJECT_ID || process.env.VITE_NEXUSS_AUTH_PROJECT_ID || "ethco-agents").trim();
  const redirectUri = (process.env.NEXUSS_AUTH_REDIRECT_URI || `${appOrigin(req)}/api/github/callback`).trim();
  try { if (new URL(authUrl).protocol !== "https:" || new URL(redirectUri).protocol !== "https:") throw new Error("HTTPS is required"); } catch {
    return res.status(500).send("Nexuss Auth is not configured. Set NEXUSS_AUTH_URL, NEXUSS_AUTH_PROJECT_ID, and NEXUSS_AUTH_REDIRECT_URI.");
  }
  const url = new URL("/oauth/start/github", authUrl);
  url.searchParams.set("project_id", projectId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("handoff", "1");
  url.searchParams.set("purpose", "github_authorization");
  return res.redirect(302, url.toString());
}

export { appOrigin };
