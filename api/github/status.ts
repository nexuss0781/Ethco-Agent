import type { VercelRequest, VercelResponse } from "@vercel/node";
import { centralGithubRequest, loadGrant } from "./_grant";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!loadGrant(req)) return res.json({ connected: false, user: null, configured: true });
  try {
    const data: any = await centralGithubRequest(req, "/v1/github/repositories");
    const grant = loadGrant(req);
    return res.json({ connected: true, user: grant?.user || (data.login ? { login: data.login, name: data.login } : null), login: data.login, source: "nexuss-auth", configured: true });
  } catch {
    return res.json({ connected: false, user: null, configured: true });
  }
}
