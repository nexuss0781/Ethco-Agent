import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import https from "https";

// Helper to send robust POST request
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startTime = Date.now();
  const diagnosticLogs: Array<{ step: string; timestamp: string; details?: any }> = [];

  const logStep = (step: string, details?: any) => {
    const entry = {
      step,
      timestamp: new Date().toISOString(),
      ...(details !== undefined ? { details } : {}),
    };
    diagnosticLogs.push(entry);
    console.log(`[AUTH-CALLBACK] ${entry.timestamp} - ${step}`, details ? JSON.stringify(details) : "");
  };

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
      });
    } catch (fetchErr: any) {
      logStep("Handoff exchange network failure", {
        errorMessage: fetchErr?.message,
      });
      throw fetchErr;
    }

    if (!response.ok) {
      const errText = await response.text();
      logStep("Handoff exchange rejected by upstream auth service", {
        upstreamStatus: response.status,
        upstreamBody: errText,
      });
      return res.status(401).json({
        error: "Nexuss Auth handoff failed",
        upstreamStatus: response.status,
        upstreamBody: errText,
        diagnostics: diagnosticLogs,
      });
    }

    let rawData: any;
    try {
      rawData = await response.json();
      logStep("Upstream JSON parsed successfully");
    } catch (jsonErr: any) {
      logStep("JSON parse error from upstream response", {
        errorMessage: jsonErr?.message,
      });
      throw jsonErr;
    }

    let resolvedUser = rawData.user || (rawData.data && rawData.data.user) || rawData.data || rawData;

    if (!resolvedUser || typeof resolvedUser !== "object") {
      resolvedUser = {
        id: "nexuss-temp-user",
        email: "user@nexuss-auth.com",
        name: "Nexuss User",
      };
    }

    const sanitizedUser = {
      id: String(resolvedUser.id || resolvedUser.userId || "nexuss-temp-user"),
      email: String(resolvedUser.email || ""),
      name: String(resolvedUser.name || ""),
      avatarUrl: resolvedUser.avatarUrl ? String(resolvedUser.avatarUrl) : null,
    };

    const secret = process.env.JWT_SECRET || "YOUR_RANDOM_SECRET_KEY";
    const token = jwt.sign(sanitizedUser, secret, { expiresIn: "7d" });

    // Set cookie on Vercel response
    const cookieHeader = `session_token=${token}; Path=/; Max-Age=${7 * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`;
    res.setHeader("Set-Cookie", cookieHeader);

    logStep("Authentication callback completed successfully", {
      totalDurationMs: Date.now() - startTime,
    });

    if (req.query.format === "json" || req.headers.accept?.includes("application/json")) {
      return res.json({
        success: true,
        user: sanitizedUser,
        durationMs: Date.now() - startTime,
        diagnostics: diagnosticLogs,
      });
    }

    // HTML response to gracefully notify popup openers and redirect
    res.setHeader("Content-Type", "text/html");
    res.end(`
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
            <p>Welcome, <strong>${sanitizedUser.name || sanitizedUser.email}</strong>. Returning to workspace...</p>
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
      totalDurationMs,
    });

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
}
