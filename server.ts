import express from "express";
import path from "path";
import fs from "fs";
import https from "https";
import { exec, execSync } from "child_process";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { WORKSPACE_TOOL_DECLARATIONS, executeWorkspaceTool } from "./server_tools";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

// Initialize Gemini SDK with telemetry header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Path to SYSTEM.md
const systemPromptPath = path.join(process.cwd(), "SYSTEM.md");
const dataDir = process.env.VERCEL ? "/tmp/data" : path.join(process.cwd(), "data");
const conversationsFile = path.join(dataDir, "conversations.json");

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Function to read SYSTEM.md instructions
function getSystemPrompt(): string {
  try {
    if (fs.existsSync(systemPromptPath)) {
      return fs.readFileSync(systemPromptPath, "utf-8");
    }
  } catch (err) {
    console.error("Error reading SYSTEM.md:", err);
  }
  return "You are Claude, a thoughtful, intellectually curious, honest, nuanced, and genuinely helpful AI assistant.";
}

// Ensure conversations storage file exists
function loadServerConversations(): any[] {
  try {
    if (fs.existsSync(conversationsFile)) {
      const data = fs.readFileSync(conversationsFile, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error reading conversations file:", err);
  }
  return [];
}

function saveServerConversations(conversations: any[]) {
  try {
    fs.writeFileSync(conversationsFile, JSON.stringify(conversations, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving conversations file:", err);
  }
}

// 1. Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

// 2. Tools Metadata API
app.get("/api/tools", (req, res) => {
  res.json({ tools: WORKSPACE_TOOL_DECLARATIONS });
});

// 3. Direct Tool Execution API
app.post("/api/tools/execute", async (req, res) => {
  try {
    const { name, args } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Tool name is required" });
    }
    const result = await executeWorkspaceTool(name, args || {});
    res.json({ success: !result.error, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Tool execution failed" });
  }
});

// Helper to send a robust POST request across various runtime versions (using global fetch or fallback to native https module)
async function robustPost(url: string, bodyObj: any): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<any> }> {
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

      // Timeout safety
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

// Auth Routes (Nexuss Auth Server Handoff)
app.get("/api/auth/callback", async (req, res) => {
  const startTime = Date.now();
  const diagnosticLogs: Array<{ step: string; timestamp: string; details?: any }> = [];

  const logStep = (step: string, details?: any) => {
    const entry = {
      step,
      timestamp: new Date().toISOString(),
      ...(details !== undefined ? { details } : {}),
    };
    diagnosticLogs.push(entry);
    console.log(`[AUTH-DIAGNOSTIC] ${entry.timestamp} - ${step}`, details ? JSON.stringify(details) : "");
  };

  logStep("Received callback request", {
    query: req.query,
    headers: {
      host: req.headers.host,
      "user-agent": req.headers["user-agent"],
      referer: req.headers.referer,
      cookie: req.headers.cookie ? "[REDACTED_COOKIE_PRESENT]" : "[NO_COOKIE]",
    },
    ip: req.ip,
  });

  const handoffToken = (req.query.handoff_token || req.query.handoffToken) as string;
  if (!handoffToken) {
    logStep("Validation failed: Missing handoff token");
    return res.status(400).json({
      error: "Missing handoff token in query parameters",
      status: 400,
      diagnostics: diagnosticLogs,
    });
  }

  try {
    const authUrl = process.env.VITE_NEXUSS_AUTH_URL || "https://nexuss-auth.vercel.app";
    const projectId = process.env.VITE_NEXUSS_AUTH_PROJECT_ID || "ethco-agents";
    
    logStep("Configuration loaded", {
      authUrl,
      projectId,
      hasJwtSecret: !!process.env.JWT_SECRET,
      tokenSnippet: `${handoffToken.substring(0, Math.min(8, handoffToken.length))}...`,
    });

    const bodyObj = {
      projectId,
      handoffToken,
      handoff_token: handoffToken,
    };

    logStep("Initiating POST handoff exchange request", {
      endpoint: `${authUrl}/v1/handoff/exchange`,
    });

    let response;
    try {
      response = await robustPost(`${authUrl}/v1/handoff/exchange`, bodyObj);
      logStep("Handoff exchange HTTP response received", {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers ? Object.fromEntries(Object.entries(response.headers)) : {},
      });
    } catch (fetchErr: any) {
      logStep("Handoff exchange network failure", {
        errorMessage: fetchErr?.message,
        errorStack: fetchErr?.stack,
        errorCode: fetchErr?.code,
      });
      throw fetchErr;
    }

    if (!response.ok) {
      const errText = await response.text();
      logStep("Handoff exchange rejected by upstream auth service", {
        upstreamStatus: response.status,
        upstreamBody: errText,
      });
      console.error("[AUTH-DIAGNOSTIC] Handoff exchange failed:", response.status, errText);
      return res.status(401).json({
        error: "Nexuss Auth handoff failed",
        upstreamStatus: response.status,
        upstreamBody: errText,
        diagnostics: diagnosticLogs,
      });
    }

    logStep("Parsing upstream response JSON");
    let rawData: any;
    try {
      rawData = await response.json();
      logStep("Upstream JSON parsed successfully", {
        hasUser: !!(rawData?.user || rawData?.data?.user || rawData?.data),
        keys: rawData ? Object.keys(rawData) : [],
      });
    } catch (jsonErr: any) {
      logStep("JSON parse error from upstream response", {
        errorMessage: jsonErr?.message,
        errorStack: jsonErr?.stack,
      });
      throw jsonErr;
    }

    let resolvedUser = rawData.user || (rawData.data && rawData.data.user) || rawData.data || rawData;
    logStep("User identity resolved from response", {
      resolvedUserSummary: resolvedUser && typeof resolvedUser === "object"
        ? { id: resolvedUser.id || resolvedUser.userId, email: resolvedUser.email, name: resolvedUser.name }
        : typeof resolvedUser,
    });

    if (!resolvedUser || typeof resolvedUser !== "object") {
      logStep("Fallback triggered: resolved user was non-object or empty", { rawData });
      resolvedUser = {
        id: "nexuss-temp-user",
        email: "user@nexuss-auth.com",
        name: "Nexuss User",
      };
    }

    logStep("Sanitizing user payload for JWT");
    const sanitizedUser = {
      id: String(resolvedUser.id || resolvedUser.userId || "nexuss-temp-user"),
      email: String(resolvedUser.email || ""),
      name: String(resolvedUser.name || ""),
      avatarUrl: resolvedUser.avatarUrl ? String(resolvedUser.avatarUrl) : null,
    };
    logStep("Sanitized user payload created", sanitizedUser);

    logStep("Inspecting JWT signing environment");
    const secret = process.env.JWT_SECRET || "YOUR_RANDOM_SECRET_KEY";
    
    // Diagnostic inspection of JWT signing
    let token: string;
    try {
      token = jwt.sign(sanitizedUser, secret, { expiresIn: "7d" });
      logStep("JWT signed successfully", {
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 15) + "...",
      });
    } catch (jwtSignErr: any) {
      logStep("JWT signing failure", {
        errorMessage: jwtSignErr?.message,
        errorStack: jwtSignErr?.stack,
        jwtType: typeof jwt,
      });
      throw jwtSignErr;
    }

    // Diagnostic self-verification of the created token
    logStep("Running self-verification on generated JWT");
    try {
      const verifiedPayload = jwt.verify(token, secret);
      logStep("JWT self-verification succeeded", {
        verifiedId: (verifiedPayload as any)?.id,
        expiresAt: (verifiedPayload as any)?.exp,
      });
    } catch (jwtVerifyErr: any) {
      logStep("JWT self-verification failed immediately after signing", {
        errorMessage: jwtVerifyErr?.message,
        errorStack: jwtVerifyErr?.stack,
      });
      throw jwtVerifyErr;
    }

    logStep("Setting session_token cookie");
    res.cookie("session_token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Automatically sync authenticated user to GitHub tokens profile
    try {
      const tokens = loadGitHubTokens();
      const loginName = sanitizedUser.name?.replace(/\s+/g, '-').toLowerCase() || sanitizedUser.email.split('@')[0] || 'developer';
      tokens[sanitizedUser.id] = {
        token: rawData?.providerToken || rawData?.accessToken || rawData?.token || "",
        githubGrantToken: rawData?.githubGrantToken || "",
        user: {
          id: sanitizedUser.id,
          login: loginName,
          name: sanitizedUser.name || sanitizedUser.email.split('@')[0] || 'Developer',
          email: sanitizedUser.email,
          avatar_url: sanitizedUser.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
          html_url: `https://github.com/${loginName}`,
        },
        authProvider: "nexuss-auth",
        updatedAt: new Date().toISOString(),
      };
      saveGitHubTokens(tokens);
    } catch (saveErr) {
      console.warn("Failed to sync Nexuss Auth user to github profile:", saveErr);
    }

    logStep("Authentication callback completed successfully", {
      totalDurationMs: Date.now() - startTime,
    });

    // Check if client requested JSON response for diagnostic inspection
    if (req.query.format === "json" || req.headers.accept?.includes("application/json")) {
      return res.json({
        success: true,
        user: sanitizedUser,
        durationMs: Date.now() - startTime,
        diagnostics: diagnosticLogs,
      });
    }

    // Return HTML that gracefully notifies opener window or redirects to /app
    res.setHeader("Content-Type", "text/html");
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Nexuss Auth Successful</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0b0b0d; color: #ecece7; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #141412; padding: 24px 32px; border-radius: 12px; border: 1px solid #2b2b27; text-align: center; max-width: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
            h2 { color: #d97757; margin-top: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Authentication Successful</h2>
            <p>Welcome, <strong>${sanitizedUser.name || sanitizedUser.email}</strong>. Returning to Ethco workspace...</p>
          </div>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({
                  type: 'NEXUSS_AUTH_SUCCESS',
                  user: ${JSON.stringify(sanitizedUser)}
                }, '*');
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
    const totalDurationMs = Date.now() - startTime;
    logStep("Fatal exception in callback handler", {
      errorMessage: err?.message,
      errorStack: err?.stack,
      errorCode: err?.code,
      errorName: err?.name,
      totalDurationMs,
    });

    console.error("[AUTH-DIAGNOSTIC] Auth callback uncaught error:", err);

    // Return detailed diagnostic payload on error with 500 status
    res.status(500).json({
      error: "Internal server error during auth callback",
      status: 500,
      message: err?.message || String(err),
      name: err?.name || "Error",
      stack: err?.stack || null,
      context: {
        nodeVersion: process.version,
        hasJwtSecret: !!process.env.JWT_SECRET,
        totalDurationMs,
      },
      diagnostics: diagnosticLogs,
    });
  }
});

app.get("/api/auth/me", (req, res) => {
  const token = req.cookies.session_token;
  if (!token) return res.json({ user: null });

  try {
    const secret = process.env.JWT_SECRET || "YOUR_RANDOM_SECRET_KEY";
    const user = jwt.verify(token, secret);
    res.json({ user });
  } catch (err) {
    res.json({ user: null });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("session_token");
  res.json({ success: true });
});

// ==========================================
// GitHub Authorization & Repository API
// ==========================================
const GITHUB_TOKENS_FILE = path.join(process.cwd(), "data", "github_tokens.json");

function loadGitHubTokens(): Record<string, any> {
  try {
    if (!fs.existsSync(path.dirname(GITHUB_TOKENS_FILE))) {
      fs.mkdirSync(path.dirname(GITHUB_TOKENS_FILE), { recursive: true });
    }
    if (fs.existsSync(GITHUB_TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(GITHUB_TOKENS_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Failed to load GitHub tokens file:", e);
  }
  return {};
}

function saveGitHubTokens(data: Record<string, any>) {
  try {
    if (!fs.existsSync(path.dirname(GITHUB_TOKENS_FILE))) {
      fs.mkdirSync(path.dirname(GITHUB_TOKENS_FILE), { recursive: true });
    }
    fs.writeFileSync(GITHUB_TOKENS_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save GitHub tokens file:", e);
  }
}

function getActiveUserIdentifier(req: express.Request): string {
  const token = req.cookies?.session_token;
  if (token) {
    try {
      const secret = process.env.JWT_SECRET || "YOUR_RANDOM_SECRET_KEY";
      const payload = jwt.verify(token, secret) as any;
      if (payload && (payload.id || payload.email)) {
        return payload.id || payload.email;
      }
    } catch {}
  }
  return "default_user";
}

function getStoredGitHubToken(userId: string): { token: string; githubGrantToken?: string; user?: any; source?: string } | null {
  const tokens = loadGitHubTokens();
  if (tokens[userId]) {
    return {
      token: tokens[userId].token || "",
      githubGrantToken: tokens[userId].githubGrantToken,
      user: tokens[userId].user,
      source: tokens[userId].authProvider || "nexuss-auth",
    };
  }
  // Check global / env fallback
  const envToken = process.env.GITHUB_TOKEN || process.env.GIT_GH;
  if (envToken) {
    return { token: envToken, source: "env" };
  }
  // Fallback to first stored token if any exists
  const firstKey = Object.keys(tokens)[0];
  if (firstKey && tokens[firstKey]) {
    return {
      token: tokens[firstKey].token || "",
      githubGrantToken: tokens[firstKey].githubGrantToken,
      user: tokens[firstKey].user,
      source: tokens[firstKey].authProvider || "stored",
    };
  }
  return null;
}

// 1. Get GitHub OAuth Authorization URL
app.get("/api/github/auth-url", (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const configured = Boolean(clientId && process.env.GITHUB_CLIENT_SECRET);
  
  // Construct redirect URI using APP_URL or request origin
  const origin = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  const redirectUri = `${origin}/api/github/callback`;
  const state = Math.random().toString(36).substring(2, 15);

  const authUrl = clientId
    ? `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent("repo,read:user,user:email")}&state=${state}`
    : "";

  res.json({
    url: authUrl,
    configured,
    redirectUri,
    hasTokenConfigured: Boolean(process.env.GITHUB_TOKEN || process.env.GIT_GH),
  });
});

// 2. GitHub OAuth Callback (both /callback and /callback/)
const githubCallbackHandler = async (req: express.Request, res: express.Response) => {
  const { code } = req.query;
  if (!code || typeof code !== "string") {
    return res.status(400).send("Missing OAuth code parameter from GitHub.");
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).send("GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET is not configured on the server.");
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Ethco-AI-Agent",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error || !tokenData.access_token) {
      console.error("GitHub token exchange failed:", tokenData);
      return res.status(401).send(`GitHub OAuth exchange error: ${tokenData.error_description || tokenData.error}`);
    }

    const accessToken = tokenData.access_token;

    // Fetch user profile from GitHub API
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "Ethco-AI-Agent",
      },
    });

    const githubUser = await userRes.json();
    const userId = getActiveUserIdentifier(req);

    // Save token mapping
    const tokens = loadGitHubTokens();
    tokens[userId] = {
      token: accessToken,
      user: {
        id: githubUser.id,
        login: githubUser.login,
        name: githubUser.name,
        avatar_url: githubUser.avatar_url,
        html_url: githubUser.html_url,
        public_repos: githubUser.public_repos,
        total_private_repos: githubUser.total_private_repos,
      },
      updatedAt: new Date().toISOString(),
    };
    saveGitHubTokens(tokens);

    // Also set active cookie for GitHub auth if needed
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
    console.error("GitHub callback exception:", err);
    res.status(500).send(`Error during GitHub callback: ${err.message || err}`);
  }
};

app.get(["/api/github/callback", "/api/github/callback/"], githubCallbackHandler);

// 3. Connect via Personal Access Token (PAT)
app.post("/api/github/connect-token", async (req, res) => {
  const token = (req.body?.token || "").trim();
  if (!token) {
    return res.status(400).json({ error: "Access token is required." });
  }

  try {
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "Ethco-AI-Agent",
      },
    });

    if (!userRes.ok) {
      const errBody = await userRes.text();
      return res.status(401).json({ error: "Invalid GitHub token or insufficient permissions.", details: errBody });
    }

    const githubUser = await userRes.json();
    const userId = getActiveUserIdentifier(req);

    const tokens = loadGitHubTokens();
    tokens[userId] = {
      token,
      user: {
        id: githubUser.id,
        login: githubUser.login,
        name: githubUser.name,
        avatar_url: githubUser.avatar_url,
        html_url: githubUser.html_url,
        public_repos: githubUser.public_repos,
        total_private_repos: githubUser.total_private_repos,
      },
      updatedAt: new Date().toISOString(),
      source: "pat",
    };
    saveGitHubTokens(tokens);

    res.json({
      success: true,
      user: tokens[userId].user,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to verify token with GitHub" });
  }
});

// 4. GitHub Connection Status (supports Nexuss Auth & OAuth)
app.get("/api/github/status", async (req, res) => {
  const userId = getActiveUserIdentifier(req);
  const tokenInfo = getStoredGitHubToken(userId);

  // Check active Nexuss Auth session token
  const sessionToken = req.cookies?.session_token;
  let sessionUser: any = null;
  if (sessionToken) {
    try {
      const secret = process.env.JWT_SECRET || "YOUR_RANDOM_SECRET_KEY";
      sessionUser = jwt.verify(sessionToken, secret) as any;
    } catch {}
  }

  const tokens = loadGitHubTokens();
  const stored = tokens[userId] || (sessionUser ? tokens[sessionUser.id || sessionUser.email] : null);

  if (stored?.user || sessionUser) {
    const user = stored?.user || {
      id: sessionUser.id,
      login: sessionUser.name?.replace(/\s+/g, '-').toLowerCase() || sessionUser.email?.split('@')[0] || 'developer',
      name: sessionUser.name || sessionUser.email?.split('@')[0] || 'Developer',
      email: sessionUser.email,
      avatar_url: sessionUser.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
      html_url: `https://github.com/${sessionUser.name?.replace(/\s+/g, '-').toLowerCase() || sessionUser.email?.split('@')[0] || 'developer'}`,
    };

    return res.json({
      connected: true,
      user,
      authProvider: 'nexuss-auth',
      source: 'nexuss-auth',
    });
  }

  if (tokenInfo?.token && tokenInfo.user) {
    return res.json({
      connected: true,
      user: tokenInfo.user,
      source: tokenInfo.source,
      authProvider: 'nexuss-auth',
    });
  }

  return res.json({
    connected: false,
    user: null,
    authProvider: 'nexuss-auth',
  });
});

// 5. Disconnect GitHub
app.post("/api/github/disconnect", (req, res) => {
  const userId = getActiveUserIdentifier(req);
  const tokens = loadGitHubTokens();
  if (tokens[userId]) {
    delete tokens[userId];
    saveGitHubTokens(tokens);
  }
  res.json({ success: true });
});

// 6. List Repositories (Authenticated User's Repos & Public Repos)
app.get("/api/github/repos", async (req, res) => {
  const userId = getActiveUserIdentifier(req);
  const tokenInfo = getStoredGitHubToken(userId);
  const query = (req.query.q as string || "").trim();

  // Check active Nexuss Auth session
  const sessionToken = req.cookies?.session_token;
  let sessionUser: any = null;
  if (sessionToken) {
    try {
      const secret = process.env.JWT_SECRET || "YOUR_RANDOM_SECRET_KEY";
      sessionUser = jwt.verify(sessionToken, secret) as any;
    } catch {}
  }

  const tokens = loadGitHubTokens();
  const stored = tokens[userId] || (sessionUser ? tokens[sessionUser.id || sessionUser.email] : null);
  const effectiveUser = stored?.user || sessionUser;

  const headers: Record<string, string> = {
    "User-Agent": "Ethco-Dev-Workspace",
    Accept: "application/vnd.github.v3+json",
  };
  if (tokenInfo?.token) {
    headers["Authorization"] = `Bearer ${tokenInfo.token}`;
  }

  try {
    let rawRepos: any[] = [];
    const authUrl = process.env.NEXUSS_AUTH_URL || "https://nexuss-auth.vercel.app";
    const projectId = process.env.NEXUSS_AUTH_PROJECT_ID || "ethco-agents";

    if (query) {
      // Search repos
      const searchUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=30&sort=updated`;
      const searchRes = await fetch(searchUrl, { headers });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        rawRepos = searchData.items || [];
      } else {
        const errText = await searchRes.text();
        return res.status(searchRes.status).json({ error: "Failed to search GitHub repositories", details: errText });
      }
    } else if (tokenInfo?.githubGrantToken) {
      // Fetch repositories from Central Nexuss Auth service using githubGrantToken (Skill Section 12)
      try {
        const centralRes = await fetch(`${authUrl}/v1/github/repositories?project_id=${encodeURIComponent(projectId)}`, {
          headers: {
            Authorization: `Bearer ${tokenInfo.githubGrantToken}`,
          },
        });
        if (centralRes.ok) {
          const centralData = await centralRes.json();
          rawRepos = centralData.repositories || centralData.repos || centralData || [];
        }
      } catch (centralErr) {
        console.warn("Nexuss Auth central repositories fetch fallback:", centralErr);
      }
    }

    if (!rawRepos || rawRepos.length === 0) {
      if (tokenInfo?.token) {
        // List user's repositories with token
        const reposUrl = "https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner,collaborator,organization_member";
        const userReposRes = await fetch(reposUrl, { headers });
        if (userReposRes.ok) {
          rawRepos = await userReposRes.json();
        }
      } else if (effectiveUser) {
        // List user's public repositories by username without requiring API key
        const username = effectiveUser.login || effectiveUser.name?.replace(/\s+/g, '-').toLowerCase() || effectiveUser.email?.split('@')[0];
        if (username) {
          const userReposRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=30`, { headers });
          if (userReposRes.ok) {
            rawRepos = await userReposRes.json();
          }
        }
        // If user has no public repos under that username, search popular repos for recommendations
        if (!rawRepos || rawRepos.length === 0) {
          const popularRes = await fetch(`https://api.github.com/search/repositories?q=stars:>1000+sort:stars&per_page=15`, { headers });
          if (popularRes.ok) {
            const data = await popularRes.json();
            rawRepos = data.items || [];
          }
        }
      } else {
        // Fallback to top repositories
        const popularRes = await fetch(`https://api.github.com/search/repositories?q=stars:>5000+sort:stars&per_page=15`, { headers });
        if (popularRes.ok) {
          const data = await popularRes.json();
          rawRepos = data.items || [];
        }
      }
    }

    // Check existing imported repos in workspace
    const reposDir = path.join(process.cwd(), "repos");
    const existingDirs = fs.existsSync(reposDir) ? fs.readdirSync(reposDir) : [];

    const repos = rawRepos.map((r: any) => {
      const sanitizedName = (r.name || "").replace(/[^a-zA-Z0-9_\-\.]/g, "_");
      const isImported = existingDirs.includes(sanitizedName) || existingDirs.includes(`${r.owner?.login}_${sanitizedName}`);
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
        is_imported: isImported,
      };
    });

    res.json({ repos, totalCount: repos.length });
  } catch (err: any) {
    console.error("Error fetching GitHub repos:", err);
    res.status(500).json({ error: err.message || "Failed to fetch repositories" });
  }
});

// 7. Clone / Import GitHub Repository
app.post("/api/github/clone", async (req, res) => {
  let repoUrl = (req.body?.repoUrl || "").trim();
  const branch = (req.body?.branch || "").trim();
  const depth = req.body?.depth ? Number(req.body.depth) : undefined;
  let customFolderName = (req.body?.folderName || "").trim();

  if (!repoUrl) {
    return res.status(400).json({ error: "Repository URL is required." });
  }

  // Format short 'owner/repo' into full URL
  if (!repoUrl.startsWith("http://") && !repoUrl.startsWith("https://") && !repoUrl.startsWith("git@")) {
    repoUrl = `https://github.com/${repoUrl}`;
  }

  const urlMatch = repoUrl.match(/[\/:]([^\/:]+?)(?:\.git)?$/);
  const repoBaseName = urlMatch ? urlMatch[1] : "cloned_repo";
  const folderName = (customFolderName || repoBaseName).replace(/[^a-zA-Z0-9_\-\.]/g, "_");

  const reposDir = path.join(process.cwd(), "repos");
  if (!fs.existsSync(reposDir)) {
    fs.mkdirSync(reposDir, { recursive: true });
  }

  const targetPath = path.join(reposDir, folderName);
  if (fs.existsSync(targetPath)) {
    return res.status(409).json({
      error: `Repository '${folderName}' is already imported in workspace.`,
      path: `repos/${folderName}`,
    });
  }

  const userId = getActiveUserIdentifier(req);
  const tokenInfo = getStoredGitHubToken(userId);
  let token = tokenInfo?.token || "";

  // If central githubGrantToken is present, fetch temporary in-memory clone token (Skill Section 12)
  if (!token && tokenInfo?.githubGrantToken) {
    try {
      const authUrl = process.env.NEXUSS_AUTH_URL || "https://nexuss-auth.vercel.app";
      const projectId = process.env.NEXUSS_AUTH_PROJECT_ID || "ethco-agents";
      const cloneTokenRes = await fetch(`${authUrl}/v1/github/clone-token?project_id=${encodeURIComponent(projectId)}`, {
        headers: {
          Authorization: `Bearer ${tokenInfo.githubGrantToken}`,
        },
      });
      if (cloneTokenRes.ok) {
        const data = await cloneTokenRes.json();
        token = data.token || data.cloneToken || data.accessToken || "";
      }
    } catch (tokenErr) {
      console.warn("Nexuss Auth clone token fetch warning:", tokenErr);
    }
  }

  let cloneUrl = repoUrl;
  if (token && repoUrl.startsWith("https://github.com/")) {
    const pathPart = repoUrl.replace("https://github.com/", "");
    cloneUrl = `https://x-access-token:${token}@github.com/${pathPart}`;
  }

  const depthArg = depth ? `--depth ${depth}` : "";
  const branchArg = branch ? `--branch ${branch}` : "";
  const cloneCmd = `git clone ${depthArg} ${branchArg} "${cloneUrl}" "${targetPath}"`;

  exec(cloneCmd, { timeout: 90000 }, (error, stdout, stderr) => {
    if (error) {
      if (fs.existsSync(targetPath)) {
        try { fs.rmSync(targetPath, { recursive: true, force: true }); } catch {}
      }
      const out = (stdout || "") + "\n" + (stderr || "");
      const sanitized = token ? out.split(token).join("[REDACTED]") : out;
      console.error("Git clone failed:", sanitized);
      return res.status(500).json({ error: `Git clone failed: ${sanitized}` });
    }

    // Inspect repository info
    let currentBranch = "main";
    let lastCommit = "";
    let fileCount = 0;
    try {
      currentBranch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: targetPath, encoding: "utf-8" }).trim();
      lastCommit = execSync('git log -1 --format="%h - %s (%cr)"', { cwd: targetPath, encoding: "utf-8" }).trim();
      const files = execSync("git ls-files", { cwd: targetPath, encoding: "utf-8" }).split("\n").filter(Boolean);
      fileCount = files.length;
    } catch {}

    res.json({
      success: true,
      repository: {
        name: folderName,
        path: `repos/${folderName}`,
        remoteUrl: repoUrl,
        branch: currentBranch,
        lastCommit,
        fileCount,
        importedAt: new Date().toISOString(),
      },
    });
  });
});

// 8. List Imported Repositories
app.get("/api/github/imported", (req, res) => {
  const reposDir = path.join(process.cwd(), "repos");
  if (!fs.existsSync(reposDir)) {
    return res.json({ repos: [] });
  }

  try {
    const entries = fs.readdirSync(reposDir, { withFileTypes: true });
    const list: any[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const repoPath = path.join(reposDir, entry.name);
      const gitDir = path.join(repoPath, ".git");
      if (!fs.existsSync(gitDir)) continue;

      let branch = "unknown";
      let lastCommit = "";
      let remoteUrl = "";
      let fileCount = 0;

      try {
        branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: repoPath, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
        lastCommit = execSync('git log -1 --format="%h - %s (%cr)"', { cwd: repoPath, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
        remoteUrl = execSync("git config --get remote.origin.url", { cwd: repoPath, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
        remoteUrl = remoteUrl.replace(/\/\/[^@]+@/, "//");
        const files = execSync("git ls-files", { cwd: repoPath, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean);
        fileCount = files.length;
      } catch {}

      list.push({
        name: entry.name,
        path: `repos/${entry.name}`,
        branch,
        lastCommit,
        remoteUrl,
        fileCount,
      });
    }

    res.json({ repos: list, count: list.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list imported repositories" });
  }
});

// 9. Sync (Pull) Imported Repository
app.post("/api/github/sync", (req, res) => {
  const repoName = (req.body?.repoName || "").trim();
  if (!repoName) return res.status(400).json({ error: "repoName is required." });

  const targetPath = path.join(process.cwd(), "repos", repoName);
  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: `Repository 'repos/${repoName}' not found.` });
  }

  exec("git pull", { cwd: targetPath, timeout: 30000 }, (error, stdout, stderr) => {
    const out = (stdout || "") + "\n" + (stderr || "");
    if (error) {
      return res.status(500).json({ error: `Git pull failed: ${out}` });
    }
    let lastCommit = "";
    try {
      lastCommit = execSync('git log -1 --format="%h - %s (%cr)"', { cwd: targetPath, encoding: "utf-8" }).trim();
    } catch {}
    res.json({ success: true, message: out.trim(), lastCommit });
  });
});

// 10. Delete Imported Repository
app.post("/api/github/delete-imported", (req, res) => {
  const repoName = (req.body?.repoName || "").trim();
  if (!repoName) return res.status(400).json({ error: "repoName is required." });

  const targetPath = path.join(process.cwd(), "repos", repoName);
  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: `Repository 'repos/${repoName}' not found.` });
  }

  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
    res.json({ success: true, message: `Removed repos/${repoName}` });
  } catch (err: any) {
    res.status(500).json({ error: `Failed to delete repository: ${err.message}` });
  }
});

// 11. Inspect Cloned Repository File Tree
app.get("/api/github/repo-tree", (req, res) => {
  const repoName = (req.query.repoName as string || "").trim();
  if (!repoName) return res.status(400).json({ error: "repoName is required." });

  const targetPath = path.join(process.cwd(), "repos", repoName);
  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: `Repository 'repos/${repoName}' not found.` });
  }

  try {
    const ignored = new Set([".git", "node_modules", "dist", ".cache", "build", ".next"]);
    function buildTree(dir: string, depth = 0): any[] {
      if (depth > 4) return [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const tree: any[] = [];
      for (const e of entries) {
        if (ignored.has(e.name)) continue;
        const full = path.join(dir, e.name);
        const rel = path.relative(targetPath, full);
        if (e.isDirectory()) {
          tree.push({
            name: e.name,
            path: rel,
            type: "directory",
            children: buildTree(full, depth + 1),
          });
        } else {
          try {
            const stat = fs.statSync(full);
            tree.push({ name: e.name, path: rel, type: "file", size: stat.size });
          } catch {
            tree.push({ name: e.name, path: rel, type: "file" });
          }
        }
      }
      return tree;
    }

    const tree = buildTree(targetPath);
    res.json({ repoName, tree });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to inspect repository tree" });
  }
});

// 4. Persistent Conversations API (Server-side multi-session storage)
app.get("/api/conversations", (req, res) => {
  const convos = loadServerConversations();
  res.json({ conversations: convos });
});

app.post("/api/conversations", (req, res) => {
  try {
    const { conversations } = req.body;
    if (Array.isArray(conversations)) {
      saveServerConversations(conversations);
      res.json({ success: true, count: conversations.length });
    } else {
      res.status(400).json({ error: "conversations must be an array" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save conversations" });
  }
});

// 5. Auto-generate Conversation Title
app.post("/api/chat/title", async (req, res) => {
  const userMessage = req.body?.userMessage || "";
  const assistantMessage = req.body?.assistantMessage || "";
  try {
    if (!userMessage) {
      return res.json({ title: "New Conversation" });
    }

    const modelsToTry = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.7-flash"];
    let generated = "";

    for (const modelName of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: `Generate a concise, elegant 2 to 5 word title (no quotation marks, no markdown, no punctuation at end) summarizing this initial user query:
User: "${userMessage.substring(0, 300)}"
${assistantMessage ? `Assistant intro: "${assistantMessage.substring(0, 150)}"` : ""}

Title:`,
          config: {
            systemInstruction: "You generate ultra-concise, elegant titles for conversations.",
            temperature: 0.3,
          },
        });

        if (response.text) {
          generated = response.text.trim().replace(/^["']|["']$/g, "");
          if (generated) break;
        }
      } catch (e) {
        console.warn(`Title gen failed with ${modelName}:`, e);
      }
    }

    res.json({ title: generated || userMessage.substring(0, 30) + (userMessage.length > 30 ? "..." : "") });
  } catch (err: any) {
    console.error("Error generating title:", err);
    res.json({ title: userMessage ? userMessage.substring(0, 30) + (userMessage.length > 30 ? "..." : "") : "New Conversation" });
  }
});

// Helper for multi-turn tool calling and streaming
async function executeAgentTurnWithTools(
  modelsToTry: string[],
  contents: any[],
  baseConfig: any,
  onChunk: (text: string) => void,
  onToolEvent: (event: any) => void
) {
  const maxToolIterations = 6;
  let iteration = 0;

  const toolsConfig = {
    ...baseConfig,
    tools: [{ functionDeclarations: WORKSPACE_TOOL_DECLARATIONS }],
  };

  while (iteration < maxToolIterations) {
    iteration++;
    let response: any = null;
    let successfulModel = "";
    let lastError: any = null;

    for (const modelName of modelsToTry) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await ai.models.generateContent({
            model: modelName,
            contents,
            config: toolsConfig,
          });
          successfulModel = modelName;
          break;
        } catch (err: any) {
          lastError = err;
          const msg = (err?.message || "").toLowerCase();
          const status = err?.status || err?.code;
          const isTransient =
            status === 503 ||
            status === 429 ||
            msg.includes("503") ||
            msg.includes("429") ||
            msg.includes("high demand") ||
            msg.includes("unavailable") ||
            msg.includes("resource exhausted") ||
            msg.includes("quota");

          console.warn(`Model ${modelName} attempt ${attempt} error in agent loop:`, err?.message || err);

          if (isTransient && attempt < 3) {
            // Exponential backoff
            await new Promise((r) => setTimeout(r, 600 * attempt));
          } else {
            break; // Try next fallback model
          }
        }
      }
      if (response) break;
    }

    if (!response) {
      throw lastError || new Error("All AI models are currently experiencing high demand. Please try again.");
    }

    const candidate = response.candidates?.[0];
    const candidateContent = candidate?.content;
    const functionCalls = response.functionCalls;

    // If the model did not request any tools, send the final text response
    if (!functionCalls || functionCalls.length === 0) {
      const finalText = response.text || "";
      if (finalText) {
        onChunk(finalText);
      }
      return { success: true, model: successfulModel };
    }

    // Preserve the complete model turn content (including thoughts, thought_signatures, and functionCalls)
    if (candidateContent) {
      contents.push(candidateContent);
    } else {
      contents.push({
        role: "model",
        parts: functionCalls.map((fc: any) => ({ functionCall: { name: fc.name, args: fc.args || {} } })),
      });
    }

    // Execute all tools requested in this step and collect the tool responses
    const responseParts: any[] = [];
    for (const call of functionCalls) {
      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const toolName = call.name;
      const toolArgs = call.args || {};

      onToolEvent({
        type: "tool_start",
        id: callId,
        name: toolName,
        args: toolArgs,
      });

      const result = await executeWorkspaceTool(toolName, toolArgs);

      onToolEvent({
        type: "tool_finish",
        id: callId,
        name: toolName,
        result,
      });

      responseParts.push({
        functionResponse: {
          name: toolName,
          response: {
            output: result,
          },
        },
      });
    }

    // Append user turn containing all functionResponses
    contents.push({
      role: "user",
      parts: responseParts,
    });
  }

  return { success: true };
}

// 6. Chat Streaming SSE Endpoint
app.post("/api/chat/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const { messages, thinkingEnabled = true, customSystemPrompt, model, actionMode = "planning" } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.write(`data: ${JSON.stringify({ error: "Messages array is required" })}\n\n`);
      return res.end();
    }

    // Load active persona instructions from SYSTEM.md
    const baseSystemPrompt = getSystemPrompt();
    let modeDirective = "";
    if (actionMode === "planning") {
      modeDirective = `\n\n## ACTIVE MODE: PLANNING
You are in Planning Mode. Structure your analysis with deep architectural clarity, systematic step-by-step roadmaps, edge-case breakdowns, component interaction diagrams (ASCII/markdown), and validation strategies before writing final code. Provide clear choices and trade-offs. You have access to workspace tools (run_command, view_file, create_file, edit_file, list_directory, generate_architecture_plan) to inspect or draft specs.`;
    } else if (actionMode === "build") {
      modeDirective = `\n\n## ACTIVE MODE: BUILD
You are in Build Mode. Focus on concrete, production-ready implementation, complete file artifacts, clean modular code without placeholders, and direct actionable solutions with robust error handling. You have access to workspace tools (run_command, view_file, create_file, edit_file, list_directory, generate_architecture_plan) to directly read, create, update files, or execute terminal commands.`;
    }

    const activeSystemInstruction = (customSystemPrompt
      ? `${baseSystemPrompt}\n\nAdditional User Context/Preferences:\n${customSystemPrompt}`
      : baseSystemPrompt) + modeDirective;

    // Convert messages to Gemini format
    const contents: Array<{ role: "user" | "model"; parts: any[] }> = [];

    for (const msg of messages) {
      const role = msg.role === "assistant" ? "model" : "user";
      const parts: any[] = [];

      // Add attachments if any (e.g. images)
      if (msg.attachments && Array.isArray(msg.attachments)) {
        for (const att of msg.attachments) {
          if (att.type === "image" && att.data) {
            const base64Data = att.data.includes("base64,") ? att.data.split("base64,")[1] : att.data;
            parts.push({
              inlineData: {
                mimeType: att.mimeType || "image/png",
                data: base64Data,
              },
            });
          } else if (att.type === "file" && att.data) {
            parts.push({
              text: `[Attached File: ${att.name}]\n${att.data}`,
            });
          }
        }
      }

      if (msg.content) {
        parts.push({ text: msg.content });
      }

      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    // Model fallback sequence
    const preferredModel = typeof model === "string" && model ? model : "gemini-3.1-flash-lite";
    const candidates = [preferredModel, "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.7-flash"];
    const modelsToTry = Array.from(new Set(candidates));

    const config: any = {
      systemInstruction: activeSystemInstruction,
      temperature: 0.7,
    };

    // Execute agent turn with tool calling support
    await executeAgentTurnWithTools(
      modelsToTry,
      contents,
      config,
      (textChunk: string) => {
        res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
      },
      (toolEvent: any) => {
        res.write(`data: ${JSON.stringify({ toolEvent })}\n\n`);
      }
    );

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error("Gemini API stream error:", error);

    let readableError = "The model is currently experiencing high demand. Please try sending your message again in a moment.";
    const errMsg = error?.message || "";
    if (errMsg && !errMsg.includes("503") && !errMsg.includes("UNAVAILABLE") && !errMsg.includes("high demand")) {
      readableError = errMsg;
    }

    res.write(
      `data: ${JSON.stringify({
        error: readableError,
      })}\n\n`
    );
    res.end();
  }
});

// Vite / static file serving
async function startServer() {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Claude Chatbot server running at http://0.0.0.0:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
