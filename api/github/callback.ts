import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import https from "https";

const GITHUB_TOKENS_FILE = path.join(process.cwd(), "data", "github_tokens.json");

async function robustPost(
  url: string,
  bodyObj: any
): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<any> }> {
  if (typeof fetch === "function") {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyObj),
      });
      return {
        ok: response.ok,
        status: response.status,
        text: async () => response.text(),
        json: async () => response.json(),
      };
    } catch (e: any) {
      console.warn("Global fetch failed, falling back to native https request:", e.message || e);
    }
  }

  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(url);
      const postData = JSON.stringify(bodyObj);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === "https:" ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({
            ok: !!(res.statusCode && res.statusCode >= 200 && res.statusCode < 300),
            status: res.statusCode || 200,
            text: async () => data,
            json: async () => JSON.parse(data || "{}"),
          });
        });
      });

      req.on("error", (e) => {
        reject(e);
      });

      req.setTimeout(10000, () => {
        req.destroy(new Error("Request timeout after 10 seconds"));
      });

      req.write(postData);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function saveTokens(data: Record<string, any>) {
  try {
    if (!fs.existsSync(path.dirname(GITHUB_TOKENS_FILE))) {
      fs.mkdirSync(path.dirname(GITHUB_TOKENS_FILE), { recursive: true });
    }
    fs.writeFileSync(GITHUB_TOKENS_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const handoffToken = (req.query.handoff_token || req.query.handoffToken) as string;
  if (!handoffToken) {
    return res.status(400).send("Missing handoff token parameter for GitHub authorization.");
  }

  try {
    const authUrl = process.env.VITE_NEXUSS_AUTH_URL || process.env.NEXUSS_AUTH_URL || "https://nexuss-auth.vercel.app";
    const projectId = process.env.VITE_NEXUSS_AUTH_PROJECT_ID || process.env.NEXUSS_AUTH_PROJECT_ID || "ethco-agents";

    const exchangeRes = await robustPost(`${authUrl}/v1/handoff/exchange`, {
      projectId,
      handoffToken,
      handoff_token: handoffToken,
    });

    if (!exchangeRes.ok) {
      const errText = await exchangeRes.text();
      return res.status(401).send(`Nexuss Auth GitHub authorization exchange failed: ${errText}`);
    }

    const data = await exchangeRes.json();
    const accessToken = data.accessToken || data.token || data.githubToken;
    const githubUser = data.user || data.githubUser || { login: "github_user", id: 1 };

    if (!accessToken) {
      return res.status(400).send("GitHub access token not received from authorization handoff.");
    }

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

    let existing: Record<string, any> = {};
    try {
      if (fs.existsSync(GITHUB_TOKENS_FILE)) {
        existing = JSON.parse(fs.readFileSync(GITHUB_TOKENS_FILE, "utf-8"));
      }
    } catch {}

    const tokenRecord = {
      token: accessToken,
      user: {
        id: githubUser.id || 1,
        login: githubUser.login || "user",
        name: githubUser.name || githubUser.login || "GitHub User",
        avatar_url: githubUser.avatar_url || "",
        html_url: githubUser.html_url || "",
        public_repos: githubUser.public_repos || 0,
        total_private_repos: githubUser.total_private_repos || 0,
      },
      authProvider: "github-oauth",
      updatedAt: new Date().toISOString(),
    };

    existing[userId] = tokenRecord;
    existing["default_user"] = tokenRecord;
    existing["latest"] = tokenRecord;
    if (githubUser.login) {
      existing[githubUser.login] = tokenRecord;
    }
    saveTokens(existing);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>GitHub Repository Authorization Successful</title>
          <style>
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #121210; color: #ecece7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1c1c19; padding: 24px 32px; border-radius: 12px; border: 1px solid #33332e; text-align: center; max-width: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            h2 { color: #d97757; margin-top: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>GitHub Authorized</h2>
            <p>Connected repository access as <strong dir="auto">@${githubUser.login || "user"}</strong>. This popup will close automatically.</p>
          </div>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'github', user: ${JSON.stringify(githubUser)} }, '*');
                setTimeout(() => window.close(), 600);
              } else {
                window.location.href = '/app';
              }
            } catch (e) {
              window.location.href = '/app';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send(`Error during GitHub callback exchange: ${err.message || err}`);
  }
}
