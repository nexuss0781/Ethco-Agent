import express from "express";
import path from "path";
import fs from "fs";
import https from "https";
import { createServer as createViteServer } from "vite";
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

    res.redirect("/");
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
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
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
