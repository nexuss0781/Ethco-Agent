import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";

const GITHUB_TOKENS_FILE = path.join(process.cwd(), "data", "github_tokens.json");

function getStoredToken(userId: string): { token: string; user?: any; source?: string } | null {
  try {
    if (fs.existsSync(GITHUB_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(GITHUB_TOKENS_FILE, "utf-8"));
      if (data[userId]?.token) return { token: data[userId].token, user: data[userId].user, source: "oauth" };
      const first = Object.keys(data)[0];
      if (first && data[first]?.token) return { token: data[first].token, user: data[first].user, source: "stored" };
    }
  } catch {}
  const envToken = process.env.GITHUB_TOKEN || process.env.GIT_GH;
  if (envToken) return { token: envToken, source: "env" };
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  let userId = "default_user";
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.match(/session_token=([^;]+)/);
    if (match) {
      try {
        const payload: any = jwt.verify(match[1], process.env.JWT_SECRET || "YOUR_RANDOM_SECRET_KEY");
        if (payload?.id || payload?.email) userId = payload.id || payload.email;
      } catch {}
    }
  }

  const tokenInfo = getStoredToken(userId);
  const configuredOAuth = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

  if (!tokenInfo?.token) {
    return res.json({ connected: false, user: null, configuredOAuth });
  }

  if (tokenInfo.user) {
    return res.json({ connected: true, user: tokenInfo.user, source: tokenInfo.source, configuredOAuth });
  }

  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenInfo.token}`,
        "User-Agent": "Ethco-AI-Agent",
      },
    });

    if (userRes.ok) {
      const u = await userRes.json();
      return res.json({
        connected: true,
        user: { id: u.id, login: u.login, name: u.name, avatar_url: u.avatar_url, html_url: u.html_url, public_repos: u.public_repos },
        source: tokenInfo.source,
        configuredOAuth,
      });
    }
    return res.json({ connected: false, user: null, configuredOAuth });
  } catch {
    return res.json({ connected: !!tokenInfo.token, user: null, configuredOAuth });
  }
}
