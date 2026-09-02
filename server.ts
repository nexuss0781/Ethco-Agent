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

// Global CORS & preflight handler
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-omniroute-key");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

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

    const isGithubAuth = req.query.purpose === 'github_authorization' || rawData.accessToken || rawData.token || rawData.githubToken;
    if (isGithubAuth) {
      const accessToken = rawData.accessToken || rawData.token || rawData.githubToken;
      let githubUser = rawData.user || rawData.githubUser || rawData.data?.user || { login: "github_user", id: 1 };
      if (accessToken) {
        try {
          const ghRes = await fetch("https://api.github.com/user", {
            headers: {
              "User-Agent": "Ethco-Dev-Workspace",
              "Authorization": `Bearer ${accessToken}`,
              "Accept": "application/vnd.github.v3+json",
            },
          });
          if (ghRes.ok) {
            const fetchedUser = await ghRes.json();
            if (fetchedUser && fetchedUser.login) {
              githubUser = fetchedUser;
            }
          }
        } catch {}

        const userId = getActiveUserIdentifier(req);
        const tokens = loadGitHubTokens();
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

        tokens[userId] = tokenRecord;
        tokens["default_user"] = tokenRecord;
        tokens["latest"] = tokenRecord;
        if (githubUser.login) {
          tokens[githubUser.login] = tokenRecord;
        }
        saveGitHubTokens(tokens);

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(`
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
      }
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

    // Check if user is already authenticated or performing an integration callback
    const existingSessionToken = req.cookies?.session_token;
    let existingUser: any = null;
    if (existingSessionToken) {
      try {
        existingUser = jwt.verify(existingSessionToken, secret);
      } catch {}
    }

    const isIntegrationAuth = 
      req.query.purpose === "github_auth" || 
      req.query.integration === "github" || 
      req.query.mode === "connect" ||
      Boolean(existingUser);

    if (!isIntegrationAuth) {
      logStep("Setting primary session_token cookie for main user login");
      res.cookie("session_token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
    } else {
      logStep("Preserving existing primary user login session (e.g. Google user)", {
        existingUser: existingUser ? (existingUser.email || existingUser.name || existingUser.id) : "Integration mode",
      });
    }

    // Extract GitHub profile and access token from rawData or resolvedUser
    const ghUserCandidate = rawData.githubUser || rawData.github_user || (resolvedUser && (resolvedUser.login || resolvedUser.html_url) ? resolvedUser : null);
    const ghTokenCandidate = 
      rawData.github_access_token || 
      rawData.githubToken || 
      rawData.github_token || 
      rawData.providerToken || 
      rawData.provider_access_token || 
      rawData.accessToken || 
      rawData.access_token || 
      rawData.token || 
      (rawData.tokens && (rawData.tokens.github?.access_token || rawData.tokens.github)) || 
      (rawData.data && (rawData.data.github_access_token || rawData.data.accessToken || rawData.data.providerToken)) ||
      "oauth_session";

    if (ghUserCandidate && (ghUserCandidate.login || ghUserCandidate.name)) {
      const tokens = loadGitHubTokens();
      const tokenRecord = {
        token: ghTokenCandidate,
        user: {
          id: ghUserCandidate.id || "gh_id",
          login: ghUserCandidate.login || ghUserCandidate.name || "user",
          name: ghUserCandidate.name || ghUserCandidate.login,
          avatar_url: ghUserCandidate.avatar_url || ghUserCandidate.avatarUrl || sanitizedUser.avatarUrl,
          html_url: ghUserCandidate.html_url || `https://github.com/${ghUserCandidate.login || 'user'}`,
        },
        authProvider: "github-oauth",
        updatedAt: new Date().toISOString(),
      };
      // Bind to active logged in user ID if present, or fallback
      const requestUserId = getActiveUserIdentifier(req);
      const activeUserId = (existingUser && (existingUser.email || existingUser.id)) ? (existingUser.email || existingUser.id) : requestUserId;
      tokens[activeUserId] = tokenRecord;
      tokens[requestUserId] = tokenRecord;
      tokens["default_user"] = tokenRecord;
      tokens["latest"] = tokenRecord;
      if (ghUserCandidate.login) {
        tokens[ghUserCandidate.login] = tokenRecord;
      }
      saveGitHubTokens(tokens);
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
          <title>Authentication Successful</title>
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
                const payload = ${JSON.stringify(sanitizedUser)};
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'github', user: payload }, '*');
                window.opener.postMessage({ type: 'NEXUSS_AUTH_SUCCESS', user: payload }, '*');
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

function getStoredGitHubToken(req?: express.Request, explicitUserId?: string): { token: string; githubGrantToken?: string; user?: any; source?: string } | null {
  // 1. Direct header token override
  const headerToken = req?.headers?.["x-github-token"] as string;
  if (headerToken && typeof headerToken === "string" && headerToken.trim()) {
    return { token: headerToken.trim(), source: "header" };
  }

  // 2. Bearer token in authorization header (if github token)
  const authHeader = req?.headers?.authorization;
  if (authHeader && (authHeader.startsWith("Bearer ghp_") || authHeader.startsWith("Bearer gho_") || authHeader.startsWith("Bearer github_pat_"))) {
    return { token: authHeader.replace(/^Bearer\s+/i, "").trim(), source: "bearer" };
  }

  // 3. Cookie token
  const cookieToken = req?.cookies?.ethco_github_token;
  if (cookieToken && typeof cookieToken === "string" && cookieToken.trim()) {
    return { token: cookieToken.trim(), source: "cookie" };
  }

  const userId = explicitUserId || (req ? getActiveUserIdentifier(req) : "default_user");
  const tokens = loadGitHubTokens();
  if (tokens[userId] && tokens[userId].token) {
    return {
      token: tokens[userId].token || "",
      githubGrantToken: tokens[userId].githubGrantToken,
      user: tokens[userId].user,
      source: tokens[userId].authProvider || "oauth",
    };
  }
  // Check global / env fallback
  const envToken = process.env.GITHUB_TOKEN || process.env.GIT_GH;
  if (envToken) {
    return { token: envToken, source: "env" };
  }
  // Fallback to most recently updated token
  const keys = Object.keys(tokens).filter(k => tokens[k] && (tokens[k].token || tokens[k].user));
  if (keys.length > 0) {
    keys.sort((a, b) => new Date(tokens[b].updatedAt || 0).getTime() - new Date(tokens[a].updatedAt || 0).getTime());
    const latestKey = keys[0];
    if (latestKey && tokens[latestKey]) {
      return {
        token: tokens[latestKey].token || "",
        githubGrantToken: tokens[latestKey].githubGrantToken,
        user: tokens[latestKey].user,
        source: tokens[latestKey].authProvider || "stored",
      };
    }
  }
  return null;
}

// 1. Get GitHub Repository Authorization URL via Nexuss Auth (Section 12 of INTEGRATION.md)
// 1. Get GitHub Repository Authorization URL (Native OAuth or Handoff fallback)
const GITHUB_OAUTH_CONFIG_FILE = path.join(process.cwd(), "data", "github_oauth_config.json");

function loadGitHubOAuthConfig() {
  try {
    if (fs.existsSync(GITHUB_OAUTH_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(GITHUB_OAUTH_CONFIG_FILE, "utf-8"));
    }
  } catch {}
  return {
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
  };
}

function saveGitHubOAuthConfig(config: { clientId: string; clientSecret: string }) {
  try {
    if (!fs.existsSync(path.dirname(GITHUB_OAUTH_CONFIG_FILE))) {
      fs.mkdirSync(path.dirname(GITHUB_OAUTH_CONFIG_FILE), { recursive: true });
    }
    fs.writeFileSync(GITHUB_OAUTH_CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save GitHub OAuth config:", e);
  }
}

app.get("/api/github/client-config", (req, res) => {
  const config = loadGitHubOAuthConfig();
  res.json({
    clientId: config.clientId || "",
    clientSecretConfigured: Boolean(config.clientSecret),
  });
});

app.post("/api/github/client-config", (req, res) => {
  try {
    const { clientId, clientSecret } = req.body;
    const current = loadGitHubOAuthConfig();
    const updated = {
      clientId: clientId !== undefined ? clientId.trim() : current.clientId,
      clientSecret: clientSecret !== undefined ? clientSecret.trim() : current.clientSecret,
    };
    saveGitHubOAuthConfig(updated);
    res.json({ success: true, clientId: updated.clientId });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to save config" });
  }
});

// 1. Direct GitHub Login Redirect
app.get("/api/github/login", (req, res) => {
  const config = loadGitHubOAuthConfig();
  const clientId = process.env.GITHUB_CLIENT_ID || config.clientId;

  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const defaultAppUrl = process.env.NODE_ENV === "production" ? "https://ethco-agent.vercel.app" : `${proto}://${host}`;
  const origin = (req.query.origin as string) || process.env.APP_URL || defaultAppUrl;
  const redirectUri = `${origin}/api/github/callback`;

  if (!clientId) {
    return res.status(400).send("GITHUB_CLIENT_ID is not configured in environment variables.");
  }

  const targetUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user`;
  res.redirect(targetUrl);
});

// 2. Get GitHub Repository Authorization URL
app.get("/api/github/auth-url", (req, res) => {
  const config = loadGitHubOAuthConfig();
  const clientId = process.env.GITHUB_CLIENT_ID || config.clientId;

  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const defaultAppUrl = process.env.NODE_ENV === "production" ? "https://ethco-agent.vercel.app" : `${proto}://${host}`;
  const origin = (req.query.origin as string) || process.env.APP_URL || defaultAppUrl;
  const redirectUri = `${origin}/api/github/callback`;

  if (!clientId) {
    return res.status(400).json({
      error: "GITHUB_CLIENT_ID is not configured in environment variables.",
      configured: false,
    });
  }

  const targetUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user`;

  res.json({
    url: targetUrl,
    configured: true,
    redirectUri,
  });
});

// 2. GitHub Repository Authorization Callback (Direct GitHub OAuth Code Exchange)
const githubCallbackHandler = async (req: express.Request, res: express.Response) => {
  const code = req.query.code as string;

  if (!code) {
    return res.status(400).send("Missing authorization code from GitHub callback.");
  }

  try {
    const config = loadGitHubOAuthConfig();
    const clientId = process.env.GITHUB_CLIENT_ID || config.clientId;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET || config.clientSecret;

    if (!clientId || !clientSecret) {
      return res.status(400).send("GitHub Client ID and Client Secret are not configured in environment variables.");
    }

    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
    const proto = req.headers["x-forwarded-proto"] || "https";
    const defaultAppUrl = process.env.NODE_ENV === "production" ? "https://ethco-agent.vercel.app" : `${proto}://${host}`;
    const origin = process.env.APP_URL || defaultAppUrl;
    const redirectUri = `${origin}/api/github/callback`;

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Ethco-Dev-Workspace",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return res.status(400).send(`Failed to obtain access token from GitHub: ${JSON.stringify(tokenData)}`);
    }

    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Ethco-Dev-Workspace",
      },
    });

    if (!userRes.ok) {
      return res.status(400).send("Failed to fetch GitHub user profile with access token.");
    }

    const githubUser = await userRes.json();
    const userId = getActiveUserIdentifier(req);
    const tokens = loadGitHubTokens();
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
    tokens[userId] = tokenRecord;
    tokens["default_user"] = tokenRecord;
    tokens["latest"] = tokenRecord;
    if (githubUser.login) {
      tokens[githubUser.login] = tokenRecord;
    }
    saveGitHubTokens(tokens);

    // Set cookie so all browser API calls include it
    res.cookie("ethco_github_token", accessToken, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: "/",
    });

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>GitHub Authorized</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              background: #0d0d0d;
              color: #ecece7;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              padding: 20px;
              box-sizing: border-box;
            }
            .card {
              background: #141412;
              padding: 32px 28px;
              border-radius: 16px;
              border: 1px solid #262626;
              text-align: center;
              max-width: 360px;
              width: 100%;
              box-shadow: 0 20px 40px rgba(0,0,0,0.6);
            }
            .avatar {
              width: 64px;
              height: 64px;
              border-radius: 50%;
              border: 2px solid #d97757;
              margin: 0 auto 16px;
              display: block;
              object-fit: cover;
            }
            h2 { color: #ffffff; margin: 0 0 8px 0; font-size: 18px; }
            p { font-size: 13px; color: #85857a; margin: 0 0 20px 0; line-height: 1.4; }
            .btn {
              display: inline-block;
              width: 100%;
              padding: 12px 16px;
              background: #d97757;
              color: #ffffff;
              font-weight: 600;
              font-size: 14px;
              border-radius: 10px;
              text-decoration: none;
              border: none;
              cursor: pointer;
              box-sizing: border-box;
            }
            .btn:hover { background: #c66647; }
          </style>
        </head>
        <body>
          <div class="card">
            ${githubUser.avatar_url ? `<img src="${githubUser.avatar_url}" class="avatar" alt="${githubUser.login}">` : ''}
            <h2>GitHub Connected!</h2>
            <p>Authorized as <strong style="color: #ffffff;">@${githubUser.login || 'user'}</strong></p>
            <a href="/app" class="btn" id="continue-btn">Continue to Workspace</a>
          </div>
          <script>
            const userData = ${JSON.stringify(githubUser)};
            const token = ${JSON.stringify(accessToken)};

            try {
              localStorage.setItem('ethco_github_user', JSON.stringify(userData));
              localStorage.setItem('ethco_github_token', token);
            } catch (e) {}

            try {
              const bc = new BroadcastChannel('github_oauth_channel');
              bc.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'github', user: userData, token: token });
            } catch (e) {}

            let openerNotified = false;
            try {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'github', user: userData, token: token }, '*');
                openerNotified = true;
                setTimeout(() => {
                  try { window.close(); } catch (e) {}
                }, 600);
              }
            } catch (e) {}

            if (!openerNotified) {
              setTimeout(() => {
                window.location.href = '/app?github_auth=success';
              }, 1000);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("GitHub OAuth error:", err);
    return res.status(500).send(`GitHub OAuth error: ${err.message || err}`);
  }
};

app.get(["/api/github/callback", "/api/github/callback/"], githubCallbackHandler);

// 4. GitHub Connection Status (checks actual GitHub OAuth token & profile)
app.get("/api/github/status", async (req, res) => {
  const tokenInfo = getStoredGitHubToken(req);

  if (tokenInfo?.token) {
    try {
      const ghRes = await fetch("https://api.github.com/user", {
        headers: {
          "User-Agent": "Ethco-Dev-Workspace",
          "Authorization": `Bearer ${tokenInfo.token}`,
          "Accept": "application/vnd.github.v3+json",
        },
      });
      if (ghRes.ok) {
        const liveUser = await ghRes.json();
        if (liveUser && liveUser.login) {
          tokenInfo.user = {
            id: liveUser.id,
            login: liveUser.login,
            name: liveUser.name || liveUser.login,
            avatar_url: liveUser.avatar_url,
            html_url: liveUser.html_url,
            public_repos: liveUser.public_repos,
            total_private_repos: liveUser.total_private_repos,
          };
          const userId = getActiveUserIdentifier(req);
          const tokens = loadGitHubTokens();
          tokens[userId] = {
            token: tokenInfo.token,
            user: tokenInfo.user,
            updatedAt: new Date().toISOString(),
          };
          tokens["default_user"] = tokens[userId];
          tokens["latest"] = tokens[userId];
          tokens[liveUser.login] = tokens[userId];
          saveGitHubTokens(tokens);
        }
      }
    } catch {}

    if (tokenInfo.user && tokenInfo.user.login) {
      return res.json({
        connected: true,
        user: tokenInfo.user,
        source: tokenInfo.source || "oauth",
        authProvider: "github",
      });
    }
  }

  return res.json({
    connected: false,
    user: null,
    authProvider: "github",
  });
});

// 5. Disconnect GitHub
app.post("/api/github/disconnect", (req, res) => {
  try {
    saveGitHubTokens({});
    res.clearCookie("ethco_github_token");
  } catch {}
  res.json({ success: true });
});

// 5b. Connect GitHub via Personal Access Token
app.post("/api/github/connect-token", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }
    const ghRes = await fetch("https://api.github.com/user", {
      headers: {
        "User-Agent": "Ethco-Dev-Workspace",
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github.v3+json",
      },
    });
    if (!ghRes.ok) {
      return res.status(400).json({ error: "Invalid GitHub Personal Access Token" });
    }
    const ghUser = await ghRes.json();
    const userId = getActiveUserIdentifier(req);
    const tokens = loadGitHubTokens();
    const tokenRecord = {
      token,
      user: {
        id: ghUser.id,
        login: ghUser.login,
        name: ghUser.name || ghUser.login,
        avatar_url: ghUser.avatar_url,
        html_url: ghUser.html_url,
      },
      authProvider: "pat",
      updatedAt: new Date().toISOString(),
    };
    tokens[userId] = tokenRecord;
    tokens["default_user"] = tokenRecord;
    tokens["latest"] = tokenRecord;
    tokens[ghUser.login] = tokenRecord;
    saveGitHubTokens(tokens);
    res.json({ success: true, user: tokenRecord.user });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to connect token" });
  }
});

// 6. List Repositories (Authenticated User's Repos & Public Repos)
app.get("/api/github/repos", async (req, res) => {
  const userId = getActiveUserIdentifier(req);
  const tokenInfo = getStoredGitHubToken(req, userId);
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
        // List user's repositories with token, fetching all pages if >100 repos
        try {
          let page = 1;
          let keepFetching = true;
          const collectedRepos: any[] = [];
          while (keepFetching && page <= 5) {
            const reposUrl = `https://api.github.com/user/repos?sort=updated&per_page=100&page=${page}&affiliation=owner,collaborator,organization_member`;
            const pageRes = await fetch(reposUrl, { headers });
            if (pageRes.ok) {
              const batch = await pageRes.json();
              if (Array.isArray(batch) && batch.length > 0) {
                collectedRepos.push(...batch);
                if (batch.length < 100) {
                  keepFetching = false;
                } else {
                  page++;
                }
              } else {
                keepFetching = false;
              }
            } else {
              keepFetching = false;
            }
          }
          rawRepos = collectedRepos;
        } catch (fetchErr) {
          console.warn("Error fetching multi-page user repos:", fetchErr);
        }
      } else if (effectiveUser) {
        // List user's public repositories by username without requiring API key
        const username = effectiveUser.login || effectiveUser.name?.replace(/\s+/g, '-').toLowerCase() || effectiveUser.email?.split('@')[0];
        if (username) {
          try {
            let page = 1;
            let keepFetching = true;
            const collectedRepos: any[] = [];
            while (keepFetching && page <= 5) {
              const userReposRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=100&page=${page}`, { headers });
              if (userReposRes.ok) {
                const batch = await userReposRes.json();
                if (Array.isArray(batch) && batch.length > 0) {
                  collectedRepos.push(...batch);
                  if (batch.length < 100) {
                    keepFetching = false;
                  } else {
                    page++;
                  }
                } else {
                  keepFetching = false;
                }
              } else {
                keepFetching = false;
              }
            }
            rawRepos = collectedRepos;
          } catch (pubErr) {
            console.warn("Error fetching public repos:", pubErr);
          }
        }
        // If user has no public repos under that username, search popular repos for recommendations
        if (!rawRepos || rawRepos.length === 0) {
          const popularRes = await fetch(`https://api.github.com/search/repositories?q=stars:>1000+sort:stars&per_page=50`, { headers });
          if (popularRes.ok) {
            const data = await popularRes.json();
            rawRepos = data.items || [];
          }
        }
      } else {
        // Fallback to top repositories
        const popularRes = await fetch(`https://api.github.com/search/repositories?q=stars:>5000+sort:stars&per_page=50`, { headers });
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

// 6b. Fetch Branches for a Repository
app.get("/api/github/branches", async (req, res) => {
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
      const tokenInfo = getStoredGitHubToken(req);
      const headers: Record<string, string> = {
        "User-Agent": "Ethco-Dev-Workspace",
        Accept: "application/vnd.github.v3+json",
      };
      if (tokenInfo?.token) {
        headers["Authorization"] = `Bearer ${tokenInfo.token}`;
      }

      const ghRes = await fetch(`https://api.github.com/repos/${repoFullName}/branches?per_page=100`, { headers });
      if (ghRes.ok) {
        const data = await ghRes.json();
        const branchNames = Array.isArray(data) ? data.map((b: any) => b.name) : ["main"];
        return res.json({ branches: branchNames, defaultBranch: branchNames[0] || "main" });
      }
    }

    return res.json({ branches: ["main", "master", "develop", "staging"], defaultBranch: "main" });
  } catch (error: any) {
    return res.json({ branches: ["main", "master"], defaultBranch: "main" });
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
  const tokenInfo = getStoredGitHubToken(req, userId);
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

async function executeOmniRouteTurn(
  modelName: string, // e.g. "omniroute/auto"
  messages: any[], // Raw original messages from req.body
  systemInstruction?: string,
  onChunk?: (text: string) => void,
  customApiKey?: string
) {
  const openAiMessages: any[] = [];
  
  // Add system prompt
  if (systemInstruction) {
    openAiMessages.push({
      role: "system",
      content: systemInstruction
    });
  }

  // Convert messages to OpenAI format
  for (const msg of messages) {
    const role = msg.role === "assistant" ? "assistant" : "user";
    const content = [];

    if (msg.content) {
      content.push({ type: "text", text: msg.content });
    }

    if (msg.attachments && Array.isArray(msg.attachments)) {
      for (const att of msg.attachments) {
        if (att.type === "image" && att.data) {
          const base64Data = att.data.includes("base64,") ? att.data : `data:${att.mimeType || 'image/png'};base64,${att.data}`;
          content.push({
            type: "image_url",
            image_url: { url: base64Data }
          });
        } else if (att.type === "file" && att.data) {
          content.push({
            type: "text",
            text: `[Attached File: ${att.name}]\n${att.data}`
          });
        }
      }
    }

    if (content.length > 0) {
      // If there's only one text part, use string to be safe for older OpenAI parsers, else use array
      if (content.length === 1 && content[0].type === "text") {
        openAiMessages.push({ role, content: content[0].text });
      } else {
        openAiMessages.push({ role, content });
      }
    }
  }

  // Extract model ID from something like 'omniroute/auto' or just 'auto'
  // But SKILL.md says use auto or exact live model. 'omniroute-auto' maps to 'auto'.
  let mappedModel = "auto";
  if (modelName === "omniroute/auto" || modelName === "omniroute-auto") {
    mappedModel = "auto";
  } else if (modelName.startsWith("omniroute/")) {
    mappedModel = modelName.replace(/^omniroute\//, "");
  } else if (modelName) {
    mappedModel = modelName;
  }

  const apiKey = (customApiKey || process.env.OMNIROUTE_AI_API_KEY || process.env.OMNIROUTE_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(
      "OmniRoute API Key missing: Please set the OMNIROUTE_AI_API_KEY secret/environment variable to authenticate with OmniRoute."
    );
  }

  const rawBase = (process.env.OMNIROUTE_API_BASE || "https://omniouter-vercel.vercel.app").trim().replace(/\/+$/, "");
  const targetUrl = rawBase.endsWith("/api/v1")
    ? `${rawBase}/chat/completions`
    : rawBase.endsWith("/chat/completions")
    ? rawBase
    : `${rawBase}/api/v1/chat/completions`;

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: mappedModel,
      stream: true,
      messages: openAiMessages,
      temperature: 0.7,
      max_tokens: 8000
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    let detail = errText;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error?.message) {
        detail = parsed.error.message;
      }
    } catch {}
    throw new Error(`OmniRoute API Error (${response.status}): ${detail}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const parsed = JSON.parse(line.slice(6));
          const chunk = parsed.choices?.[0]?.delta?.content;
          if (chunk) {
            onChunk(chunk);
          }
        } catch (e) {
          // Ignore parse errors on partial stream
        }
      }
    }
  }
}

// 6. Chat Streaming SSE Endpoint
app.get("/api/chat/stream", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Chat stream endpoint is operational. Send a POST request with messages to stream completions.",
  });
});

app.post("/api/chat/stream", async (req, res) => {
  console.log("Received POST /api/chat/stream");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const { messages, thinkingEnabled = true, customSystemPrompt, model, actionMode = "planning", selectedRepos } = req.body;

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

    // Selected Repositories Context Directive for the AI Agent
    let repoContextDirective = "";
    if (Array.isArray(selectedRepos) && selectedRepos.length > 0) {
      repoContextDirective = `\n\n## SELECTED REPOSITORIES CONTEXT:
The user selected ${selectedRepos.length} repository(s). This may be intentional or accidental:
${selectedRepos.map((r: any, idx: number) => `${idx + 1}. **${r.name}** (${r.fullName || r.name}) on branch \`${r.branch || 'main'}\`${r.language ? ` [${r.language}]` : ''}${r.isPrivate ? ' (Private)' : ' (Public)'}`).join('\n')}
Please take the correct action based purely on the context of the user's message. If their prompt clearly relates to these repositories, use your workspace tools to inspect them. If the message is unrelated, you may ignore this selection.`;
    }

    const activeSystemInstruction = (customSystemPrompt
      ? `${baseSystemPrompt}\n\nAdditional User Context/Preferences:\n${customSystemPrompt}`
      : baseSystemPrompt) + modeDirective + repoContextDirective;

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
    const preferredModel = typeof model === "string" && model ? model : "auto";

    if (
      preferredModel.startsWith("omniroute") ||
      preferredModel === "auto" ||
      preferredModel.startsWith("auto/")
    ) {
      // Execute via OmniRoute custom router without workspace tools (standard chat fallback)
      await executeOmniRouteTurn(
        preferredModel,
        messages,
        activeSystemInstruction,
        (textChunk: string) => {
          res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
        },
        req.body?.omnirouteApiKey || (req.headers["x-omniroute-key"] as string)
      );
    } else {
      // Execute via native Gemini with workspace tools
      const candidates = [preferredModel, "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.7-flash"];
      const modelsToTry = Array.from(new Set(candidates));

      const config: any = {
        systemInstruction: activeSystemInstruction,
        temperature: 0.7,
      };

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
    }

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
