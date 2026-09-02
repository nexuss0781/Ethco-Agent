import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const repoFullName = (req.query.repo as string || req.query.repoFullName as string || "").trim();
    const repoName = (req.query.repoName as string || req.query.name as string || "").trim();

    // 1. If local imported repo exists in workspace, check local git branches first
    const reposDir = path.join(process.cwd(), "repos");
    const targetFolder = repoName || (repoFullName ? repoFullName.split("/").pop() : "");
    if (targetFolder) {
      const localRepoPath = path.join(reposDir, targetFolder);
      if (fs.existsSync(path.join(localRepoPath, ".git"))) {
        try {
          const raw = execSync("git branch -a --format='%(refname:short)'", {
            cwd: localRepoPath,
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "ignore"],
          });
          const localBranches = raw
            .split("\n")
            .map((b) => b.trim().replace(/^origin\//, ""))
            .filter((b) => b && !b.includes("HEAD"));
          const uniqueBranches = Array.from(new Set(localBranches));
          if (uniqueBranches.length > 0) {
            return res.json({ branches: uniqueBranches, defaultBranch: uniqueBranches[0] || "main" });
          }
        } catch {}
      }
    }

    // 2. Fetch remote branches from GitHub API
    if (repoFullName && repoFullName.includes("/")) {
      const token = req.headers["x-github-token"] as string || process.env.GITHUB_TOKEN;
      const headers: Record<string, string> = {
        "User-Agent": "Ethco-Dev-Workspace",
        Accept: "application/vnd.github.v3+json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const ghRes = await fetch(`https://api.github.com/repos/${repoFullName}/branches?per_page=100`, { headers });
      if (ghRes.ok) {
        const data = await ghRes.json();
        const branchNames = Array.isArray(data) ? data.map((b: any) => b.name) : ["main"];
        return res.json({ branches: branchNames, defaultBranch: branchNames[0] || "main" });
      }
    }

    // Fallback default branches
    return res.json({ branches: ["main", "master", "develop", "staging"], defaultBranch: "main" });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Failed to fetch branches", branches: ["main", "master"] });
  }
}
