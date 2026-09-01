import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";

const GITHUB_TOKENS_FILE = path.join(process.cwd(), "data", "github_tokens.json");

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

  let token = process.env.GITHUB_TOKEN || process.env.GIT_GH || "";
  try {
    if (fs.existsSync(GITHUB_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(GITHUB_TOKENS_FILE, "utf-8"));
      if (data[userId]?.token) token = data[userId].token;
      else {
        const first = Object.keys(data)[0];
        if (first && data[first]?.token) token = data[first].token;
      }
    }
  } catch {}

  const query = (req.query.q as string || "").trim();
  const headers: Record<string, string> = {
    "User-Agent": "Ethco-AI-Agent",
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    let rawRepos: any[] = [];
    if (query) {
      const sRes = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=30&sort=updated`, { headers });
      if (sRes.ok) {
        const sData = await sRes.json();
        rawRepos = sData.items || [];
      } else {
        return res.status(sRes.status).json({ error: "Search failed", details: await sRes.text() });
      }
    } else if (token) {
      const uRes = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100", { headers });
      if (uRes.ok) {
        rawRepos = await uRes.json();
      } else {
        return res.status(uRes.status).json({ error: "Failed to fetch repositories", details: await uRes.text() });
      }
    } else {
      return res.status(401).json({ error: "Not authenticated with GitHub" });
    }

    const reposDir = path.join(process.cwd(), "repos");
    const existingDirs = fs.existsSync(reposDir) ? fs.readdirSync(reposDir) : [];

    const repos = rawRepos.map((r: any) => {
      const sanitizedName = (r.name || "").replace(/[^a-zA-Z0-9_\-\.]/g, "_");
      return {
        id: r.id,
        name: r.name,
        full_name: r.full_name,
        private: r.private,
        html_url: r.html_url,
        clone_url: r.clone_url,
        description: r.description,
        default_branch: r.default_branch || "main",
        language: r.language,
        stargazers_count: r.stargazers_count || 0,
        forks_count: r.forks_count || 0,
        updated_at: r.updated_at,
        is_imported: existingDirs.includes(sanitizedName) || existingDirs.includes(`${r.owner?.login}_${sanitizedName}`),
      };
    });

    res.json({ repos, totalCount: repos.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch repositories" });
  }
}
