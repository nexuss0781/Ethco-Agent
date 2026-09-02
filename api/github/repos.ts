import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "fs";
import path from "path";
import { centralGithubRequest } from "./_grant.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
    const data: any = await centralGithubRequest(req, "/v1/github/repositories");
    const rawRepos: any[] = Array.isArray(data.repositories) ? data.repositories : [];
    const reposDir = path.join(process.cwd(), "repos");
    const existingDirs = fs.existsSync(reposDir) ? fs.readdirSync(reposDir) : [];
    const repos = rawRepos.filter((r) => !query || `${r.name || ""} ${r.full_name || r.fullName || ""} ${r.description || ""}`.toLowerCase().includes(query)).map((r: any) => {
      const fullName = r.full_name || r.fullName || `${r.owner?.login || ""}/${r.name || ""}`;
      const sanitizedName = (r.name || "").replace(/[^a-zA-Z0-9_\-.]/g, "_");
      return {
        id: r.id, name: r.name, full_name: fullName, private: r.private === true,
        html_url: r.html_url || r.htmlUrl || `https://github.com/${fullName}`,
        clone_url: r.clone_url || `https://github.com/${fullName}.git`, description: r.description || null,
        default_branch: r.default_branch || r.defaultBranch || "main", language: r.language || null,
        stargazers_count: r.stargazers_count || 0, forks_count: r.forks_count || 0, updated_at: r.updated_at || r.updatedAt || null,
        is_imported: existingDirs.includes(sanitizedName),
      };
    });
    return res.json({ repos, totalCount: repos.length, login: data.login });
  } catch (error: any) {
    return res.status(error?.message?.includes("Connect GitHub") ? 401 : 502).json({ error: error?.message || "Failed to fetch repositories" });
  }
}
