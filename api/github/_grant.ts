import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import type { VercelRequest } from "@vercel/node";

export const GITHUB_GRANTS_FILE = path.join(process.cwd(), "data", "github_tokens.json");
export const NEXUSS_AUTH_URL = (process.env.NEXUSS_AUTH_URL || process.env.VITE_NEXUSS_AUTH_URL || "https://nexuss-auth.vercel.app").replace(/\/+$/, "");
export const NEXUSS_PROJECT_ID = process.env.NEXUSS_AUTH_PROJECT_ID || process.env.VITE_NEXUSS_AUTH_PROJECT_ID || "ethco-agents";

export function userId(req: VercelRequest): string {
  const match = (req.headers.cookie || "").match(/(?:^|;\s*)session_token=([^;]+)/);
  if (match) {
    try {
      const payload: any = jwt.verify(decodeURIComponent(match[1]), process.env.JWT_SECRET || "YOUR_RANDOM_SECRET_KEY");
      if (payload?.id || payload?.email) return String(payload.id || payload.email);
    } catch {}
  }
  return "default_user";
}

export function loadGrant(req: VercelRequest): { grantToken: string; user?: any } | null {
  const cookie = (req.headers.cookie || "").match(/(?:^|;\s*)github_grant_token=([^;]+)/);
  if (cookie?.[1]) return { grantToken: decodeURIComponent(cookie[1]) };
  try {
    if (!fs.existsSync(GITHUB_GRANTS_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(GITHUB_GRANTS_FILE, "utf8"));
    const record = data[userId(req)] || data.default_user || data.latest;
    return record?.grantToken ? { grantToken: record.grantToken, user: record.user } : null;
  } catch { return null; }
}

export function saveGrant(req: VercelRequest, grantToken: string, user: any): void {
  let data: Record<string, any> = {};
  try { if (fs.existsSync(GITHUB_GRANTS_FILE)) data = JSON.parse(fs.readFileSync(GITHUB_GRANTS_FILE, "utf8")); } catch {}
  const record = { grantToken, user, authProvider: "nexuss-auth", updatedAt: new Date().toISOString() };
  data[userId(req)] = record;
  data.default_user = record;
  data.latest = record;
  try {
    fs.mkdirSync(path.dirname(GITHUB_GRANTS_FILE), { recursive: true });
    fs.writeFileSync(GITHUB_GRANTS_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch {
    // Serverless deployments may have a read-only project directory. The callback
    // also sets the grant as an HttpOnly cookie, so repository access still works.
  }
}

export async function centralGithubRequest<T>(req: VercelRequest, endpoint: string): Promise<T> {
  const grant = loadGrant(req);
  if (!grant) throw new Error("Connect GitHub before using repository access.");
  const url = new URL(endpoint, NEXUSS_AUTH_URL);
  url.searchParams.set("project_id", NEXUSS_PROJECT_ID);
  const response = await fetch(url, { headers: { accept: "application/json", authorization: `Bearer ${grant.grantToken}` } });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Nexuss Auth could not access GitHub.");
  return body as T;
}
