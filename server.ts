import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

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
const dataDir = path.join(process.cwd(), "data");
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

// 2. System prompt API
app.get("/api/system-prompt", (req, res) => {
  const prompt = getSystemPrompt();
  res.json({ systemPrompt: prompt });
});

app.post("/api/system-prompt", (req, res) => {
  try {
    const { systemPrompt } = req.body;
    if (typeof systemPrompt === "string") {
      fs.writeFileSync(systemPromptPath, systemPrompt, "utf-8");
      res.json({ success: true, message: "System prompt updated in SYSTEM.md" });
    } else {
      res.status(400).json({ error: "Invalid system prompt format" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update SYSTEM.md" });
  }
});

// 3. Persistent Conversations API (Server-side multi-session storage)
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

// Helper function to call generateContentStream with retry, chunk-level protection and fallback models
async function streamWithResilientFailover(
  modelsToTry: string[],
  contents: any[],
  config: any,
  onChunk: (text: string) => void
) {
  let lastError: any = null;
  let hasSentAnyChunk = false;

  for (const modelName of modelsToTry) {
    // Attempt up to 2 tries per model if transient 503/429
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const stream = await ai.models.generateContentStream({
          model: modelName,
          contents,
          config,
        });

        for await (const chunk of stream) {
          const chunkText = chunk.text || "";
          if (chunkText) {
            hasSentAnyChunk = true;
            onChunk(chunkText);
          }
        }

        // If we reached here, generation succeeded
        return { success: true, model: modelName };
      } catch (err: any) {
        lastError = err;
        const errMsg = (err?.message || "").toLowerCase();
        console.warn(`Model ${modelName} attempt ${attempt} error (sentChunks: ${hasSentAnyChunk}):`, err?.message || err);

        // If chunks were already transmitted to the client, we cannot cleanly switch models mid-sentence
        if (hasSentAnyChunk) {
          throw err;
        }

        const isTransient =
          err?.status === 503 ||
          err?.status === 429 ||
          err?.code === 503 ||
          err?.code === 429 ||
          errMsg.includes("high demand") ||
          errMsg.includes("unavailable") ||
          errMsg.includes("resource exhausted") ||
          errMsg.includes("rate limit") ||
          errMsg.includes("overloaded");

        if (isTransient && attempt < 2) {
          await new Promise((r) => setTimeout(r, 400));
        } else {
          break; // move to next fallback model
        }
      }
    }
  }

  // If all streaming models failed and no chunks were sent, try single-shot generateContent as emergency fallback
  if (!hasSentAnyChunk) {
    const emergencyModels = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.7-flash"];
    for (const emModel of emergencyModels) {
      try {
        const directResp = await ai.models.generateContent({
          model: emModel,
          contents,
          config,
        });
        if (directResp.text) {
          onChunk(directResp.text);
          return { success: true, model: emModel };
        }
      } catch (e: any) {
        console.warn(`Emergency non-streaming fallback on ${emModel} failed:`, e?.message || e);
      }
    }
  }

  throw lastError;
}

// 4. Auto-generate Conversation Title
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

// 5. Chat Streaming SSE Endpoint
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
You are in Planning Mode. Structure your analysis with deep architectural clarity, systematic step-by-step roadmaps, edge-case breakdowns, component interaction diagrams (ASCII/markdown), and validation strategies before writing final code. Provide clear choices and trade-offs.`;
    } else if (actionMode === "build") {
      modeDirective = `\n\n## ACTIVE MODE: BUILD
You are in Build Mode. Focus on concrete, production-ready implementation, complete file artifacts, clean modular code without placeholders, and direct actionable solutions with robust error handling.`;
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
            // Strip data:image/...;base64, prefix if present
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

    // Call streaming API with resilient model failover & chunk protection
    await streamWithResilientFailover(
      modelsToTry,
      contents,
      config,
      (textChunk: string) => {
        res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Claude Chatbot server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
