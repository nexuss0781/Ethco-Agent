import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";

const GITHUB_TOKENS_FILE = path.join(process.cwd(), "data", "github_tokens.json");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const token = (req.body?.token || "").trim();
  if (!token) return res.status(400).json({ error: "Token is required" });

  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "Ethco-AI-Agent" },
    });

    if (!userRes.ok) {
      return res.status(401).json({ error: "Invalid GitHub token or insufficient scopes." });
    }

    const githubUser = await userRes.json();
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

    if (!fs.existsSync(path.dirname(GITHUB_TOKENS_FILE))) {
      fs.mkdirSync(path.dirname(GITHUB_TOKENS_FILE), { recursive: true });
    }
    let existing: Record<string, any> = {};
    if (fs.existsSync(GITHUB_TOKENS_FILE)) {
      try { existing = JSON.parse(fs.readFileSync(GITHUB_TOKENS_FILE, "utf-8")); } catch {}
    }

    existing[userId] = {
      token,
      user: {
        id: githubUser.id,
        login: githubUser.login,
        name: githubUser.name,
        avatar_url: githubUser.avatar_url,
        html_url: githubUser.html_url,
        public_repos: githubUser.public_repos,
      },
      updatedAt: new Date().toISOString(),
      source: "pat",
    };
    fs.writeFileSync(GITHUB_TOKENS_FILE, JSON.stringify(existing, null, 2), "utf-8");

    res.json({ success: true, user: existing[userId].user });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to verify token" });
  }
}
