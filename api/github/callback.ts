import type { VercelRequest, VercelResponse } from "@vercel/node";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";

const GITHUB_TOKENS_FILE = path.join(process.cwd(), "data", "github_tokens.json");

function saveTokens(data: Record<string, any>) {
  try {
    if (!fs.existsSync(path.dirname(GITHUB_TOKENS_FILE))) {
      fs.mkdirSync(path.dirname(GITHUB_TOKENS_FILE), { recursive: true });
    }
    fs.writeFileSync(GITHUB_TOKENS_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    return res.status(400).send("Missing OAuth code parameter.");
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send("GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET not configured.");
  }

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Ethco-AI-Agent",
      },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(401).send(`GitHub OAuth failed: ${tokenData.error_description || tokenData.error}`);
    }

    const accessToken = tokenData.access_token;
    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "Ethco-AI-Agent" },
    });
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

    let existing: Record<string, any> = {};
    try {
      if (fs.existsSync(GITHUB_TOKENS_FILE)) {
        existing = JSON.parse(fs.readFileSync(GITHUB_TOKENS_FILE, "utf-8"));
      }
    } catch {}

    existing[userId] = {
      token: accessToken,
      user: {
        id: githubUser.id,
        login: githubUser.login,
        name: githubUser.name,
        avatar_url: githubUser.avatar_url,
        html_url: githubUser.html_url,
        public_repos: githubUser.public_repos,
      },
      updatedAt: new Date().toISOString(),
    };
    saveTokens(existing);

    res.setHeader("Content-Type", "text/html");
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GitHub Authorization Successful</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #121210; color: #ecece7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1c1c19; padding: 24px 32px; border-radius: 12px; border: 1px solid #33332e; text-align: center; max-width: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            h2 { color: #d97757; margin-top: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Authorized with GitHub</h2>
            <p>Connected as <strong>@${githubUser.login}</strong>. This popup will close automatically.</p>
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
    res.status(500).send(`Error during GitHub callback: ${err.message || err}`);
  }
}
