# Tools Specification & Implementation Guide

This document specifies all the tools, schemas, runtime mechanics, and architectures required to implement full tool/function calling capabilities for the AI assistant system.

---

## 1. System Architecture & Tool Calling Flow

```
+------------------+         +----------------------+         +-----------------------+
|  User Message /  | ------> |  AI Engine (Gemini)  | ------> |  Tool Call Request    |
|  Planning Action |         | (Function Calling)   |         | { name, arguments }   |
+------------------+         +----------------------+         +-----------------------+
                                                                         |
                                                                         v
+------------------+         +----------------------+         +-----------------------+
|  Final Assistant | <------ |  Tool Result Feed-in | <------ |  Server Tool Executor |
|  Response/Stream |         |  (role: "tool")      |         |  (Sandboxed & Typed)  |
+------------------+         +----------------------+         +-----------------------+
```

### 1.1 SDK Integration Pattern
Using `@google/genai` (SDK 0.1.1+):

```typescript
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Declaring tools with Type schemas
const tools = [
  {
    functionDeclarations: [
      {
        name: "search_web",
        description: "Searches the web for up-to-date information, documentation, and live data.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: "The search query to execute.",
            },
          },
          required: ["query"],
        },
      },
    ],
  },
];
```

---

## 2. Core Tool Catalog

Below is the complete specification of the tools required across **Planning**, **Build**, and **Analysis** workflows.

### 2.1 File System & Code Inspection Tools

#### `view_file`
- **Purpose**: View text file contents with line slicing and pagination.
- **Parameters**:
  - `path` (`string`, required): Absolute or relative workspace path.
  - `startLine` (`integer`, optional): 1-indexed starting line number.
  - `endLine` (`integer`, optional): 1-indexed ending line number.
- **Return Type**: `{ content: string, totalLines: number, byteSize: number }`

#### `create_file`
- **Purpose**: Create a new file with content, creating parent directories if needed.
- **Parameters**:
  - `path` (`string`, required): Target file path.
  - `content` (`string`, required): File contents.
  - `overwrite` (`boolean`, optional, default: false): Whether to overwrite existing file.
- **Return Type**: `{ success: boolean, path: string, bytesWritten: number }`

#### `edit_file`
- **Purpose**: Perform exact substring replacement for surgical, reliable code edits.
- **Parameters**:
  - `path` (`string`, required): Target file path.
  - `targetContent` (`string`, required): Exact existing substring to replace.
  - `replacementContent` (`string`, required): Replacement string.
- **Return Type**: `{ success: boolean, path: string }`

#### `list_directory`
- **Purpose**: List directory contents including subdirectories and file metadata.
- **Parameters**:
  - `directoryPath` (`string`, required): Path to directory.
  - `recursive` (`boolean`, optional, default: false): Whether to list recursively.
- **Return Type**: `{ files: Array<{ name: string, type: "file" | "directory", size?: number }> }`

---

### 2.2 Execution & Runtime Tools

#### `run_command`
- **Purpose**: Execute safe terminal commands in a sandboxed Node/Bash environment.
- **Parameters**:
  - `command` (`string`, required): Exact command line string to run.
  - `cwd` (`string`, optional): Working directory for the command.
  - `timeoutMs` (`integer`, optional, default: 15000): Execution timeout.
- **Return Type**: `{ stdout: string, stderr: string, exitCode: number, durationMs: number }`

#### `compile_code` / `validate_syntax`
- **Purpose**: Run project linter and TypeScript compiler to catch type errors and syntax breakages.
- **Parameters**:
  - `target` (`string`, optional): Specific subpath or target to validate.
- **Return Type**: `{ passed: boolean, errors: string[], warnings: string[] }`

---

### 2.3 Information Retrieval & Live Web Grounding

#### `search_web`
- **Purpose**: Perform web queries to retrieve current documentation, API specs, and technical information.
- **Parameters**:
  - `query` (`string`, required): Search keywords or specific phrase.
  - `domainFilter` (`string`, optional): Specific domain to restrict search to (e.g., `developer.mozilla.org`, `github.com`).
- **Return Type**: `{ results: Array<{ title: string, url: string, snippet: string }> }`

#### `fetch_url_content`
- **Purpose**: Fetch clean markdown or text content from a web URL.
- **Parameters**:
  - `url` (`string`, required): Web URL to scrape/fetch.
- **Return Type**: `{ url: string, title?: string, markdownContent: string, status: number }`

---

### 2.4 Planning & Architecture Tools

#### `generate_architecture_plan`
- **Purpose**: Generate structured architectural blueprint, dependency graphs, and milestone steps.
- **Parameters**:
  - `projectName` (`string`, required): Name of the component or system.
  - `requirements` (`array of strings`, required): Core functional requirements.
  - `constraints` (`array of strings`, optional): Technical constraints (e.g. bundle size, no external auth).
- **Return Type**: `{ blueprint: string, steps: Array<{ step: number, title: string, deliverables: string[] }> }`

---

## 3. Schema & Execution Dispatcher Implementation

### 3.1 Backend Tool Definitions (`server/tools.ts`)

```typescript
import { Type } from "@google/genai";

export const TOOL_DEFINITIONS = [
  {
    name: "search_web",
    description: "Search web resources for technical information and current documentation.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "view_file",
    description: "Read content from a workspace file with line bounds.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "Path to file" },
        startLine: { type: Type.INTEGER, description: "Optional starting line" },
        endLine: { type: Type.INTEGER, description: "Optional ending line" },
      },
      required: ["path"],
    },
  },
  {
    name: "edit_file",
    description: "Replace exact target substring with replacement content in a file.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: { type: Type.STRING, description: "Path to file" },
        targetContent: { type: Type.STRING, description: "Exact substring to replace" },
        replacementContent: { type: Type.STRING, description: "New replacement content" },
      },
      required: ["path", "targetContent", "replacementContent"],
    },
  },
];
```

### 3.2 Tool Dispatcher Engine (`server/dispatcher.ts`)

```typescript
import * as fs from "fs";
import * as path from "path";

export async function executeToolCall(name: string, args: Record<string, any>): Promise<any> {
  const root = process.cwd();

  switch (name) {
    case "view_file": {
      const filePath = path.resolve(root, args.path.replace(/^\//, ""));
      if (!fs.existsSync(filePath)) {
        return { error: `File not found: ${args.path}` };
      }
      const raw = fs.readFileSync(filePath, "utf-8");
      const lines = raw.split("\n");
      const start = Math.max(1, args.startLine || 1);
      const end = Math.min(lines.length, args.endLine || lines.length);
      const slice = lines.slice(start - 1, end).join("\n");
      return {
        content: slice,
        totalLines: lines.length,
        showingLines: `${start} to ${end}`,
      };
    }

    case "edit_file": {
      const filePath = path.resolve(root, args.path.replace(/^\//, ""));
      if (!fs.existsSync(filePath)) {
        return { error: `File not found: ${args.path}` };
      }
      const content = fs.readFileSync(filePath, "utf-8");
      if (!content.includes(args.targetContent)) {
        return { error: "targetContent not found in file" };
      }
      const updated = content.replace(args.targetContent, args.replacementContent);
      fs.writeFileSync(filePath, updated, "utf-8");
      return { success: true, path: args.path };
    }

    default:
      return { error: `Unknown tool name: ${name}` };
  }
}
```

---

## 4. Multi-Turn Function Calling Loop

When a user prompt triggers one or more tool calls:

1. **Model Generates `functionCalls`**: The Gemini model returns `toolCall` tokens.
2. **Backend Intercepts & Executes**: The server dispatches the calls to `executeToolCall`.
3. **Appends Tool Response**: The response is fed back with role `tool` and `functionResponse`.
4. **Model Formulates Final Output**: The model processes the tool results to produce the final user-facing response with full context.
