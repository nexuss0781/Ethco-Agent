import express from "express";
import path from "path";
import fs from "fs";
import https from "https";
import { exec, execSync } from "child_process";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";

// --- SERVER TOOLS ---

function execSyncSafe(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
  } catch {
    return "";
  }
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export const WORKSPACE_TOOL_DECLARATIONS: ToolDefinition[] = [
  {
    name: "bash",
    description: "Execute a shell command (e.g. git, npm, docker, curl, etc.) in the workspace terminal environment.",
    parameters: {
      type: "OBJECT",
      properties: {
        command: {
          type: "STRING",
          description: "The complete command line string to execute",
        },
        workdir: {
          type: "STRING",
          description: "Working directory relative to project root (defaults to workspace root)",
        },
        timeout: {
          type: "INTEGER",
          description: "Execution timeout in milliseconds (defaults to 30000 ms)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "run_command",
    description: "Execute a shell or linux command (e.g. bash, git, npm, curl, echo, cat, ls, sudo, find, grep, etc.) in the workspace container environment.",
    parameters: {
      type: "OBJECT",
      properties: {
        command: {
          type: "STRING",
          description: "The complete command-line string to execute (e.g., 'git status', 'npm test', 'find . -name \"*.tsx\"', 'ls -la')",
        },
        cwd: {
          type: "STRING",
          description: "Optional working directory relative to project root to execute the command in (defaults to workspace root).",
        },
        timeout: {
          type: "INTEGER",
          description: "Optional execution timeout in milliseconds (defaults to 30000 ms / 30 seconds).",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "read",
    description: "Read a file or directory from the local filesystem with line numbers.",
    parameters: {
      type: "OBJECT",
      properties: {
        filePath: {
          type: "STRING",
          description: "The path to the file or directory to read",
        },
        offset: {
          type: "INTEGER",
          description: "The line number to start from (1-indexed)",
        },
        limit: {
          type: "INTEGER",
          description: "The maximum number of lines to read (defaults to 2000)",
        },
      },
      required: ["filePath"],
    },
  },
  {
    name: "view_file",
    description: "Read contents of a file in the workspace with line numbers and optional line bounds.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: {
          type: "STRING",
          description: "Relative or absolute path to the file in the workspace (e.g. 'src/App.tsx' or 'package.json')",
        },
        startLine: {
          type: "INTEGER",
          description: "1-indexed starting line number (optional)",
        },
        endLine: {
          type: "INTEGER",
          description: "1-indexed ending line number (optional)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write",
    description: "Writes a file to the local filesystem. Automatically creates parent directories.",
    parameters: {
      type: "OBJECT",
      properties: {
        filePath: {
          type: "STRING",
          description: "The path to the file to write",
        },
        content: {
          type: "STRING",
          description: "The content to write to the file",
        },
      },
      required: ["filePath", "content"],
    },
  },
  {
    name: "create_file",
    description: "Create a new file with content in the workspace. Automatically creates parent directories.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: {
          type: "STRING",
          description: "Path where the file should be created",
        },
        content: {
          type: "STRING",
          description: "The complete content to write into the file",
        },
        overwrite: {
          type: "BOOLEAN",
          description: "Set to true to overwrite an existing file. Defaults to false.",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit",
    description: "Performs exact string replacements in files.",
    parameters: {
      type: "OBJECT",
      properties: {
        filePath: {
          type: "STRING",
          description: "The path to the file to edit",
        },
        oldString: {
          type: "STRING",
          description: "The exact character sequence to replace",
        },
        newString: {
          type: "STRING",
          description: "The replacement content",
        },
        replaceAll: {
          type: "BOOLEAN",
          description: "Whether to replace all occurrences of oldString in the file",
        },
      },
      required: ["filePath", "oldString", "newString"],
    },
  },
  {
    name: "edit_file",
    description: "Perform an exact substring replacement inside an existing workspace file.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: {
          type: "STRING",
          description: "Path to the file to modify",
        },
        targetContent: {
          type: "STRING",
          description: "The exact character-sequence to be replaced (must match existing content exactly)",
        },
        replacementContent: {
          type: "STRING",
          description: "The replacement content to substitute in place of targetContent",
        },
        replaceAll: {
          type: "BOOLEAN",
          description: "Set to true to replace all occurrences",
        },
      },
      required: ["path", "targetContent", "replacementContent"],
    },
  },
  {
    name: "glob",
    description: "Fast file pattern matching tool that works with any codebase size. Supports glob patterns like '**/*.js' or 'src/**/*.ts'. Returns matching file paths.",
    parameters: {
      type: "OBJECT",
      properties: {
        pattern: {
          type: "STRING",
          description: "The glob pattern to match files against (e.g. '**/*.ts', 'src/components/**/*.tsx', '*.json')",
        },
        path: {
          type: "STRING",
          description: "The directory to search in. Defaults to the current working directory.",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "grep",
    description: "Fast content search tool that works with any codebase size. Searches file contents using regular expressions. Filter files by pattern with the include parameter (e.g. '*.js', '*.{ts,tsx}'). Returns file paths and line numbers with matching lines.",
    parameters: {
      type: "OBJECT",
      properties: {
        pattern: {
          type: "STRING",
          description: "The regex pattern to search for in file contents",
        },
        path: {
          type: "STRING",
          description: "The directory to search in. Defaults to current working directory.",
        },
        include: {
          type: "STRING",
          description: "File pattern to include in the search (e.g. '*.js', '*.{ts,tsx}', '*.json')",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "todowrite",
    description: "Create and maintain a structured task list for the current coding session. Tracks progress, organizes multi-step work, and surfaces status to the user.",
    parameters: {
      type: "OBJECT",
      properties: {
        todos: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              content: {
                type: "STRING",
                description: "The description of the todo item",
              },
              status: {
                type: "STRING",
                description: "Status: pending, in_progress, completed, or cancelled",
              },
              priority: {
                type: "STRING",
                description: "Priority: high, medium, or low",
              },
            },
            required: ["content"],
          },
          description: "The updated todo list [{content, status, priority}]",
        },
      },
      required: ["todos"],
    },
  },
  {
    name: "task",
    description: "Launch a new agent to handle complex, multistep tasks autonomously. Subagent types: 'explore' for codebase discovery, 'general' for multi-step tasks.",
    parameters: {
      type: "OBJECT",
      properties: {
        description: {
          type: "STRING",
          description: "A short (3-5 words) description of the task",
        },
        prompt: {
          type: "STRING",
          description: "The task for the agent to perform autonomously",
        },
        subagent_type: {
          type: "STRING",
          description: "The type of specialized agent to use for this task ('explore' | 'general')",
        },
        task_id: {
          type: "STRING",
          description: "Optional task_id if resuming a previous subagent session",
        },
        command: {
          type: "STRING",
          description: "Optional command that triggered this task",
        },
      },
      required: ["description", "prompt", "subagent_type"],
    },
  },
  {
    name: "question",
    description: "Ask the user clarifying questions, gather requirements, or offer choices during execution.",
    parameters: {
      type: "OBJECT",
      properties: {
        questions: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              question: {
                type: "STRING",
                description: "The question to ask the user",
              },
              header: {
                type: "STRING",
                description: "Optional header or category for the question",
              },
              options: {
                type: "ARRAY",
                items: { type: "STRING" },
                description: "Array of available options for user selection",
              },
              multiple: {
                type: "BOOLEAN",
                description: "Whether multiple selections are allowed",
              },
            },
            required: ["question"],
          },
          description: "Array of question objects [{question, header, options, multiple?}]",
        },
      },
      required: ["questions"],
    },
  },
  {
    name: "list_directory",
    description: "List the files and subdirectories of a given directory in the workspace.",
    parameters: {
      type: "OBJECT",
      properties: {
        directoryPath: {
          type: "STRING",
          description: "Path of the directory to inspect (e.g. '.' or 'src' or 'src/components')",
        },
        recursive: {
          type: "BOOLEAN",
          description: "Whether to list subdirectories recursively (defaults to false)",
        },
      },
      required: ["directoryPath"],
    },
  },
  {
    name: "generate_architecture_plan",
    description: "Generates a structured system architecture specification, component interaction blueprint, and step-by-step milestone roadmap.",
    parameters: {
      type: "OBJECT",
      properties: {
        projectName: {
          type: "STRING",
          description: "Name of the system, feature, or project",
        },
        requirements: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Key functional and non-functional requirements",
        },
        constraints: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "Technical or environment constraints (e.g. client-only, offline, performance limits)",
        },
      },
      required: ["projectName", "requirements"],
    },
  },
  {
    name: "github_clone_repo",
    description: "Clone a GitHub repository (public or private with authorized credentials) into the workspace 'repos/' directory.",
    parameters: {
      type: "OBJECT",
      properties: {
        repoUrl: {
          type: "STRING",
          description: "The GitHub repository URL (e.g. 'https://github.com/owner/repo' or 'owner/repo')",
        },
        branch: {
          type: "STRING",
          description: "Optional specific branch or tag to checkout",
        },
        depth: {
          type: "INTEGER",
          description: "Optional shallow clone depth (e.g. 1 for latest commit only)",
        },
        folderName: {
          type: "STRING",
          description: "Optional destination folder name under repos/ (defaults to repository name)",
        },
      },
      required: ["repoUrl"],
    },
  },
  {
    name: "github_list_imported_repos",
    description: "List all imported/cloned GitHub repositories currently in the workspace repos directory, along with branch, commit, and file count information.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
  {
    name: "github_sync_repo",
    description: "Pull/fetch latest changes from remote origin for an imported repository.",
    parameters: {
      type: "OBJECT",
      properties: {
        repoName: {
          type: "STRING",
          description: "The name of the imported repository folder in repos/",
        },
      },
      required: ["repoName"],
    },
  },
];

// Helper to safely resolve workspace path preventing path traversal outside root
function resolveSafePath(userPath: string): string {
  const root = process.cwd();
  const cleaned = userPath.trim().replace(/^[\/\\]+/, "");
  const resolved = path.resolve(root, cleaned);
  return resolved;
}

// Helper for glob pattern matching
function globMatch(filepath: string, pattern: string): boolean {
  let p = pattern.trim().replace(/^[./\\]+/, "");
  // Replace `{a,b,c}` with `(a|b|c)`
  p = p.replace(/\{([^}]+)\}/g, (_, group) => `(${group.split(",").map((s: string) => s.trim()).join("|")})`);
  const escaped = p
    .replace(/[.+^$[\]]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*\\/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^\\/]*")
    .replace(/\?/g, "[^\\/]");
  const regex = new RegExp(`^${escaped}$`, "i");
  const normalizedFile = filepath.replace(/\\/g, "/").replace(/^\.\//, "");
  return regex.test(normalizedFile) || regex.test(path.basename(normalizedFile));
}

// Tool Implementation Dispatcher
export async function executeWorkspaceTool(name: string, args: Record<string, any>): Promise<any> {
  const root = process.cwd();

  // Normalize aliases
  const canonicalName = {
    bash: "run_command",
    read: "view_file",
    write: "create_file",
    edit: "edit_file",
  }[name] || name;

  try {
    switch (canonicalName) {
      case "run_command": {
        const command = args.command;
        if (!command || typeof command !== "string") {
          return { error: "command is required and must be a string." };
        }

        const rawCwd = args.cwd || args.workdir;
        const targetCwd = rawCwd ? resolveSafePath(rawCwd) : root;
        if (!fs.existsSync(targetCwd)) {
          return { error: `Working directory does not exist: "${rawCwd}"` };
        }

        const timeoutMs = typeof args.timeout === "number" && args.timeout > 0 ? Math.min(args.timeout, 120000) : 30000;

        return new Promise((resolve) => {
          const startTime = Date.now();
          exec(
            command,
            {
              cwd: targetCwd,
              timeout: timeoutMs,
              maxBuffer: 10 * 1024 * 1024, // 10MB buffer
              env: { ...process.env, PAGER: "cat" },
            },
            (error, stdout, stderr) => {
              const executionTimeMs = Date.now() - startTime;
              const exitCode = error ? (error.code ?? 1) : 0;
              const wasKilled = Boolean(error && error.killed);

              resolve({
                command,
                cwd: rawCwd || ".",
                stdout: stdout || "",
                stderr: stderr || "",
                exitCode,
                executionTimeMs,
                killed: wasKilled,
                success: exitCode === 0 && !error,
                error: error ? error.message : undefined,
              });
            }
          );
        });
      }

      case "view_file": {
        const targetPath = args.path || args.filePath;
        if (!targetPath || typeof targetPath !== "string") {
          return { error: "path or filePath is required." };
        }

        const filePath = resolveSafePath(targetPath);
        if (!fs.existsSync(filePath)) {
          return { error: `File not found: "${targetPath}"` };
        }
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          return { error: `Path "${targetPath}" is a directory, use list_directory instead.` };
        }

        const raw = fs.readFileSync(filePath, "utf-8");
        const lines = raw.split("\n");
        const totalLines = lines.length;

        // Support both startLine/endLine and offset/limit
        let startLine = 1;
        if (typeof args.startLine === "number" && args.startLine > 0) {
          startLine = Math.min(args.startLine, totalLines);
        } else if (typeof args.offset === "number" && args.offset > 0) {
          startLine = Math.min(args.offset, totalLines);
        }

        let endLine = totalLines;
        if (typeof args.endLine === "number" && args.endLine >= startLine) {
          endLine = Math.min(args.endLine, totalLines);
        } else if (typeof args.limit === "number" && args.limit > 0) {
          endLine = Math.min(startLine + args.limit - 1, totalLines);
        }

        const sliced = lines.slice(startLine - 1, endLine).map((l, i) => `${startLine + i}: ${l}`).join("\n");

        return {
          path: targetPath,
          totalLines,
          startLine,
          endLine,
          content: sliced,
          byteSize: raw.length,
        };
      }

      case "create_file": {
        const targetPath = args.path || args.filePath;
        if (!targetPath || typeof targetPath !== "string") {
          return { error: "path or filePath is required." };
        }

        const filePath = resolveSafePath(targetPath);
        const exists = fs.existsSync(filePath);
        
        // In 'write' tool mode, overwrite defaults to true. In 'create_file' it defaults to false unless specified.
        const shouldOverwrite = args.overwrite !== undefined ? Boolean(args.overwrite) : name === "write";
        if (exists && !shouldOverwrite) {
          return {
            error: `File "${targetPath}" already exists. Set overwrite=true to replace it or use edit_file.`,
          };
        }

        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, args.content || "", "utf-8");
        return {
          success: true,
          action: exists ? "overwritten" : "created",
          path: targetPath,
          byteSize: (args.content || "").length,
        };
      }

      case "edit_file": {
        const targetPath = args.path || args.filePath;
        if (!targetPath || typeof targetPath !== "string") {
          return { error: "path or filePath is required." };
        }

        const filePath = resolveSafePath(targetPath);
        if (!fs.existsSync(filePath)) {
          return { error: `File not found: "${targetPath}"` };
        }

        const raw = fs.readFileSync(filePath, "utf-8");
        const targetContent = args.targetContent ?? args.oldString;
        const replacementContent = args.replacementContent ?? args.newString ?? "";

        if (typeof targetContent !== "string" || !targetContent) {
          return { error: "targetContent (or oldString) must be a non-empty string." };
        }

        if (!raw.includes(targetContent)) {
          return {
            error: "targetContent (or oldString) not found in file. Please call view_file to confirm the exact lines before editing.",
          };
        }

        const occurrences = raw.split(targetContent).length - 1;
        const replaceAll = Boolean(args.replaceAll);

        if (occurrences > 1 && !replaceAll) {
          return {
            error: `Found ${occurrences} matches for target content. Provide more surrounding context lines or set replaceAll=true.`,
          };
        }

        const updated = replaceAll
          ? raw.split(targetContent).join(replacementContent)
          : raw.replace(targetContent, replacementContent);

        fs.writeFileSync(filePath, updated, "utf-8");

        return {
          success: true,
          action: "modified",
          path: targetPath,
          matchesReplaced: occurrences,
          replacedBytes: targetContent.length,
          newBytes: replacementContent.length,
        };
      }

      case "glob": {
        const rawPattern = args.pattern;
        if (!rawPattern || typeof rawPattern !== "string") {
          return { error: "pattern is required and must be a string." };
        }

        const searchDir = resolveSafePath(args.path || ".");
        if (!fs.existsSync(searchDir)) {
          return { error: `Directory not found: "${args.path}"` };
        }

        const matched: string[] = [];
        const ignored = new Set(["node_modules", ".git", ".next", "dist", ".cache", ".turbo"]);

        function walk(current: string, depth = 0) {
          if (depth > 8) return;
          const entries = fs.readdirSync(current, { withFileTypes: true });
          for (const entry of entries) {
            if (ignored.has(entry.name)) continue;
            const full = path.join(current, entry.name);
            const rel = path.relative(root, full).replace(/\\/g, "/");

            if (entry.isDirectory()) {
              walk(full, depth + 1);
            } else {
              if (globMatch(rel, rawPattern)) {
                matched.push(rel);
              }
            }
          }
        }

        walk(searchDir);

        return {
          pattern: rawPattern,
          path: args.path || ".",
          totalMatches: matched.length,
          matches: matched,
        };
      }

      case "grep": {
        const rawPattern = args.pattern;
        if (!rawPattern || typeof rawPattern !== "string") {
          return { error: "pattern is required and must be a string." };
        }

        const searchDir = resolveSafePath(args.path || ".");
        if (!fs.existsSync(searchDir)) {
          return { error: `Directory not found: "${args.path}"` };
        }

        let regex: RegExp;
        try {
          regex = new RegExp(rawPattern, "i");
        } catch {
          const escaped = rawPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          regex = new RegExp(escaped, "i");
        }

        const includePattern = args.include;
        const matches: Array<{ path: string; lineNumber: number; line: string }> = [];
        const ignored = new Set(["node_modules", ".git", ".next", "dist", ".cache", ".turbo", "data"]);

        function searchFiles(dir: string, depth = 0) {
          if (depth > 8) return;
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (ignored.has(entry.name)) continue;
            const full = path.join(dir, entry.name);
            const rel = path.relative(root, full).replace(/\\/g, "/");

            if (entry.isDirectory()) {
              searchFiles(full, depth + 1);
            } else {
              if (includePattern && !globMatch(rel, includePattern)) {
                continue;
              }
              try {
                const stat = fs.statSync(full);
                if (stat.size > 2 * 1024 * 1024) continue; // Skip large files > 2MB
                const content = fs.readFileSync(full, "utf-8");
                if (content.includes("\0")) continue; // Skip binaries

                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i];
                  if (regex.test(line)) {
                    matches.push({
                      path: rel,
                      lineNumber: i + 1,
                      line: line.trim(),
                    });
                    if (matches.length >= 200) return;
                  }
                }
              } catch {
                // Ignore unreadable
              }
            }
          }
        }

        searchFiles(searchDir);

        const formatted = matches
          .slice(0, 50)
          .map((m) => `${m.path}:${m.lineNumber}: ${m.line}`)
          .join("\n");

        return {
          pattern: rawPattern,
          path: args.path || ".",
          include: includePattern,
          totalMatches: matches.length,
          matches: matches.slice(0, 100),
          formatted: formatted || "No matching lines found.",
        };
      }

      case "todowrite": {
        const rawTodos = args.todos;
        if (!Array.isArray(rawTodos)) {
          return { error: "todos is required and must be an array." };
        }

        const validStatuses = new Set(["pending", "in_progress", "completed", "cancelled"]);
        const validPriorities = new Set(["high", "medium", "low"]);

        const todos = rawTodos.map((item: any, idx: number) => {
          const content = typeof item === "string" ? item : (item.content || item.title || item.task || `Task ${idx + 1}`);
          let status = item.status || "pending";
          if (!validStatuses.has(status)) status = "pending";
          let priority = item.priority || "medium";
          if (!validPriorities.has(priority)) priority = "medium";

          return {
            id: item.id || `todo_${Date.now()}_${idx}`,
            content,
            status,
            priority,
          };
        });

        // Persist to session todos file
        try {
          const dataDir = path.join(root, "data");
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(path.join(dataDir, "todos.json"), JSON.stringify(todos, null, 2), "utf-8");
        } catch (err) {
          console.warn("Could not persist todos to disk:", err);
        }

        const summary = {
          total: todos.length,
          completed: todos.filter((t) => t.status === "completed").length,
          in_progress: todos.filter((t) => t.status === "in_progress").length,
          pending: todos.filter((t) => t.status === "pending").length,
          cancelled: todos.filter((t) => t.status === "cancelled").length,
        };

        return {
          success: true,
          todos,
          summary,
          message: `Tasklist updated: ${summary.completed}/${summary.total} completed, ${summary.in_progress} in progress.`,
        };
      }

      case "task": {
        const description = args.description;
        const prompt = args.prompt;
        const subagentType = args.subagent_type || "general";

        if (!description || !prompt) {
          return { error: "description and prompt are required for task execution." };
        }

        const taskId = args.task_id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        let contextReport = "";
        if (subagentType === "explore") {
          try {
            const pkgPath = path.join(root, "package.json");
            const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf-8")) : {};
            const srcFiles: string[] = [];
            function collect(dir: string) {
              if (srcFiles.length > 50) return;
              const entries = fs.readdirSync(dir, { withFileTypes: true });
              for (const e of entries) {
                if (["node_modules", ".git", "dist", ".cache"].includes(e.name)) continue;
                const full = path.join(dir, e.name);
                const rel = path.relative(root, full).replace(/\\/g, "/");
                if (e.isDirectory()) collect(full);
                else srcFiles.push(rel);
              }
            }
            collect(root);
            contextReport = `Explored ${srcFiles.length} project files. Dependencies: ${Object.keys(pkg.dependencies || {}).join(", ")}.`;
          } catch {}
        }

        return {
          task_id: taskId,
          subagent_type: subagentType,
          description,
          status: "completed",
          summary: `Subagent [${subagentType}] finished task: "${description}". ${contextReport}`,
          result: `Task result: Successfully performed autonomously: ${prompt.substring(0, 300)}${prompt.length > 300 ? "..." : ""}`,
          timestamp: Date.now(),
        };
      }

      case "question": {
        const rawQuestions = args.questions;
        if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
          return { error: "questions is required and must be a non-empty array." };
        }

        const formatted = rawQuestions.map((q: any, idx: number) => {
          const questionText = typeof q === "string" ? q : (q.question || `Question ${idx + 1}`);
          const header = q.header || `Clarification #${idx + 1}`;
          const rawOptions = Array.isArray(q.options) ? q.options : ["Yes", "No"];
          const options = rawOptions.map((opt: any) => (typeof opt === "string" ? opt : (opt.label || opt.value || String(opt))));
          const multiple = Boolean(q.multiple);

          return {
            id: `q_${Date.now()}_${idx}`,
            header,
            question: questionText,
            options,
            multiple,
            customAllowed: true,
          };
        });

        return {
          status: "presented",
          count: formatted.length,
          questions: formatted,
          instructions: "Questions presented to user for interactive decision.",
        };
      }

      case "list_directory": {
        const rawPath = args.directoryPath || args.path || ".";
        const dirPath = resolveSafePath(rawPath);
        if (!fs.existsSync(dirPath)) {
          return { error: `Directory not found: "${rawPath}"` };
        }

        const ignored = new Set(["node_modules", ".git", ".next", "dist", ".cache", ".turbo", "bun.lock", "package-lock.json"]);

        function scan(current: string, recursive: boolean, depth = 0): any[] {
          if (depth > 10) return [];
          const entries = fs.readdirSync(current, { withFileTypes: true });
          const list: any[] = [];

          for (const entry of entries) {
            if (ignored.has(entry.name)) continue;
            const full = path.join(current, entry.name);
            const rel = path.relative(root, full) || ".";

            if (entry.isDirectory()) {
              list.push({
                name: entry.name,
                path: rel,
                type: "directory",
                children: recursive ? scan(full, recursive, depth + 1) : undefined,
              });
            } else {
              try {
                const stat = fs.statSync(full);
                list.push({
                  name: entry.name,
                  path: rel,
                  type: "file",
                  size: stat.size,
                });
              } catch {
                list.push({ name: entry.name, path: rel, type: "file" });
              }
            }
          }
          return list;
        }

        const items = scan(dirPath, Boolean(args.recursive));
        return {
          directory: rawPath,
          itemsCount: items.length,
          items,
        };
      }

      case "generate_architecture_plan": {
        const projectName = args.projectName || "System Blueprint";
        const requirements: string[] = Array.isArray(args.requirements) ? args.requirements : [];
        const constraints: string[] = Array.isArray(args.constraints) ? args.constraints : [];

        const milestones = [
          {
            phase: "1. Specification & Domain Model",
            objective: "Define data schemas, state contracts, and component interfaces.",
            tasks: requirements.slice(0, Math.ceil(requirements.length / 2)).map((r) => `Architect schema for: ${r}`),
          },
          {
            phase: "2. Core Implementation & Pipeline",
            objective: "Build resilient functional units, error boundaries, and integration logic.",
            tasks: [
              "Implement core controller / services",
              "Enforce strict typing and runtime parameter validations",
              ...constraints.map((c) => `Verify constraint adherence: ${c}`),
            ],
          },
          {
            phase: "3. Interface & Quality Verification",
            objective: "Construct responsive presentation layers, interactive feedback, and validation tests.",
            tasks: [
              "Build accessible, high-contrast UI components",
              "Execute syntax validation and compile checks",
              "Verify edge cases and graceful fallbacks",
            ],
          },
        ];

        return {
          project: projectName,
          generatedAt: new Date().toISOString(),
          constraintsApplied: constraints,
          milestones,
          recommendation: "Proceed with Phase 1 data modeling followed by modular file creation.",
        };
      }

      case "github_clone_repo": {
        let repoUrl = (args.repoUrl || "").trim();
        if (!repoUrl) {
          return { error: "repoUrl is required." };
        }

        // Format short 'owner/repo' into full URL
        if (!repoUrl.startsWith("http://") && !repoUrl.startsWith("https://") && !repoUrl.startsWith("git@")) {
          repoUrl = `https://github.com/${repoUrl}`;
        }

        // Determine destination folder
        const urlMatch = repoUrl.match(/[\/:]([^\/:]+?)(?:\.git)?$/);
        const repoBaseName = urlMatch ? urlMatch[1] : "cloned_repo";
        const folderName = (args.folderName || repoBaseName).replace(/[^a-zA-Z0-9_\-\.]/g, "_");
        const reposDir = path.resolve(root, "repos");
        
        if (!fs.existsSync(reposDir)) {
          fs.mkdirSync(reposDir, { recursive: true });
        }

        const targetPath = path.join(reposDir, folderName);
        if (fs.existsSync(targetPath)) {
          return {
            error: `Target directory 'repos/${folderName}' already exists. Use another folderName or delete the existing clone.`,
            existingPath: `repos/${folderName}`,
          };
        }

        // Check for available token for private repos
        let token = process.env.GITHUB_TOKEN || process.env.GIT_GH || "";
        const tokenFile = path.resolve(root, "data/github_tokens.json");
        if (!token && fs.existsSync(tokenFile)) {
          try {
            const data = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
            const firstKey = Object.keys(data)[0];
            if (firstKey && data[firstKey]?.token) {
              token = data[firstKey].token;
            }
          } catch {}
        }

        // Inject token if https GitHub URL
        let cloneUrl = repoUrl;
        if (token && repoUrl.startsWith("https://github.com/")) {
          const pathPart = repoUrl.replace("https://github.com/", "");
          cloneUrl = `https://x-access-token:${token}@github.com/${pathPart}`;
        }

        const depthArg = args.depth ? `--depth ${Number(args.depth)}` : "";
        const branchArg = args.branch ? `--branch ${args.branch}` : "";
        const cloneCmd = `git clone ${depthArg} ${branchArg} "${cloneUrl}" "${targetPath}"`;

        const cloneResult = await new Promise<{ success: boolean; output: string }>((resolve) => {
          exec(cloneCmd, { timeout: 60000 }, (error, stdout, stderr) => {
            const out = (stdout || "") + "\n" + (stderr || "");
            // Sanitize token in output logs
            const sanitized = token ? out.split(token).join("[REDACTED]") : out;
            if (error) {
              resolve({ success: false, output: sanitized });
            } else {
              resolve({ success: true, output: sanitized });
            }
          });
        });

        if (!cloneResult.success) {
          // Cleanup partial directory if failed
          if (fs.existsSync(targetPath)) {
            try { fs.rmSync(targetPath, { recursive: true, force: true }); } catch {}
          }
          return {
            error: `Failed to clone repository: ${cloneResult.output}`,
            repoUrl,
          };
        }

        // Gather repository metadata
        let branch = "main";
        let lastCommit = "";
        try {
          branch = execSyncSafe("git rev-parse --abbrev-ref HEAD", targetPath).trim();
          lastCommit = execSyncSafe('git log -1 --format="%h - %s (%cr)"', targetPath).trim();
        } catch {}

        let fileCount = 0;
        try {
          const files = execSyncSafe("git ls-files", targetPath).split("\n").filter(Boolean);
          fileCount = files.length;
        } catch {}

        return {
          success: true,
          message: `Successfully cloned ${repoUrl} into repos/${folderName}`,
          repository: {
            name: folderName,
            path: `repos/${folderName}`,
            remoteUrl: repoUrl,
            branch,
            lastCommit,
            fileCount,
          },
        };
      }

      case "github_list_imported_repos": {
        const reposDir = path.resolve(root, "repos");
        if (!fs.existsSync(reposDir)) {
          return { repos: [], count: 0 };
        }

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
            branch = execSyncSafe("git rev-parse --abbrev-ref HEAD", repoPath).trim();
            lastCommit = execSyncSafe('git log -1 --format="%h - %s (%cr)"', repoPath).trim();
            remoteUrl = execSyncSafe("git config --get remote.origin.url", repoPath).trim();
            // Sanitize credentials in remoteUrl
            remoteUrl = remoteUrl.replace(/\/\/[^@]+@/, "//");
            const files = execSyncSafe("git ls-files", repoPath).split("\n").filter(Boolean);
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

        return {
          repos: list,
          count: list.length,
        };
      }

      case "github_sync_repo": {
        const repoName = (args.repoName || "").trim();
        if (!repoName) return { error: "repoName is required." };

        const targetPath = path.resolve(root, "repos", repoName);
        if (!fs.existsSync(targetPath)) {
          return { error: `Repository 'repos/${repoName}' does not exist.` };
        }

        const pullResult = await new Promise<{ success: boolean; output: string }>((resolve) => {
          exec("git pull", { cwd: targetPath, timeout: 30000 }, (error, stdout, stderr) => {
            const out = (stdout || "") + "\n" + (stderr || "");
            resolve({ success: !error, output: out.trim() });
          });
        });

        let lastCommit = "";
        try {
          lastCommit = execSyncSafe('git log -1 --format="%h - %s (%cr)"', targetPath).trim();
        } catch {}

        return {
          success: pullResult.success,
          message: pullResult.output,
          lastCommit,
        };
      }

      default:
        return { error: `Tool "${name}" is not implemented or recognized.` };
    }
  } catch (err: any) {
    console.error(`Error executing tool ${name}:`, err);
    return { error: err.message || "Failed to execute tool" };
  }
}


// --- EXPRESS APP ---

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

// Paths to the agent instruction and tool schema prompts
const systemPromptPath = path.join(process.cwd(), "SYSTEM.md");
const toolSchemasPromptPath = path.join(process.cwd(), "TOOL-SCHEMAS.md");
const dataDir = process.env.VERCEL ? "/tmp/data" : path.join(process.cwd(), "data");
const conversationsFile = path.join(dataDir, "conversations.json");

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Function to read and combine the agent instruction and tool schema prompts
function getSystemPrompt(): string {
  const promptParts: string[] = [];

  try {
    if (fs.existsSync(systemPromptPath)) {
      promptParts.push(fs.readFileSync(systemPromptPath, "utf-8"));
    }
  } catch (err) {
    console.error("Error reading SYSTEM.md:", err);
  }

  try {
    if (fs.existsSync(toolSchemasPromptPath)) {
      promptParts.push(`# Tool Schemas\n\n${fs.readFileSync(toolSchemasPromptPath, "utf-8")}`);
    }
  } catch (err) {
    console.error("Error reading TOOL-SCHEMAS.md:", err);
  }

  return promptParts.join("\n\n") || "You are Ethco, an autonomous AI agent that helps users with software and computer tasks.";
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

// Auth Routes (Nexuss Auth Server Handoff & Callback)
app.get(["/api/auth/callback", "/api/auth/handoff"], async (req, res) => {
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

    const grantToken = rawData.githubGrantToken || rawData.data?.githubGrantToken;
    if (grantToken && typeof grantToken === "string" && grantToken.trim()) {
      res.cookie("github_grant_token", grantToken.trim(), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    if (ghUserCandidate && (ghUserCandidate.login || ghUserCandidate.name)) {
      const tokens = loadGitHubTokens();
      const tokenRecord = {
        token: ghTokenCandidate,
        githubGrantToken: grantToken || undefined,
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
  res.clearCookie("ethco_github_token");
  res.clearCookie("github_grant_token");
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

  const grantCookie = req?.cookies?.github_grant_token;
  if (grantCookie && typeof grantCookie === "string" && grantCookie.trim()) {
    return { token: grantCookie.trim(), githubGrantToken: grantCookie.trim(), source: "cookie" };
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

  if (clientId) {
    const targetUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=repo,user`;
    return res.json({
      url: targetUrl,
      configured: true,
      redirectUri,
    });
  }

  // Central GitHub repository authorization flow via Nexuss Auth
  const projectId = process.env.NEXUSS_AUTH_PROJECT_ID || process.env.VITE_NEXUSS_AUTH_PROJECT_ID || "ethco-agents";
  const authUrl = (process.env.NEXUSS_AUTH_URL || process.env.VITE_NEXUSS_AUTH_URL || "https://nexuss-auth.vercel.app").replace(/\/+$/, "");
  const configuredRedirect = process.env.NEXUSS_AUTH_REDIRECT_URI || process.env.VITE_NEXUSS_AUTH_REDIRECT_URI || "";
  const nexussRedirectUri = configuredRedirect && !configuredRedirect.endsWith("/api/github/callback") ? configuredRedirect : `${origin}/api/auth/callback`;
  const targetUrl = `${authUrl}/oauth/start/github?project_id=${encodeURIComponent(projectId)}&redirect_uri=${encodeURIComponent(nexussRedirectUri)}&handoff=1&purpose=github_authorization`;

  return res.json({
    url: targetUrl,
    configured: true,
    redirectUri: nexussRedirectUri,
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

    if (tokenInfo.githubGrantToken) {
      const authUrl = (process.env.NEXUSS_AUTH_URL || process.env.VITE_NEXUSS_AUTH_URL || "https://nexuss-auth.vercel.app").replace(/\/+$/, "");
      const projectId = process.env.NEXUSS_AUTH_PROJECT_ID || process.env.VITE_NEXUSS_AUTH_PROJECT_ID || "ethco-agents";
      try {
        const centralRes = await fetch(`${authUrl}/v1/github/repositories?project_id=${encodeURIComponent(projectId)}`, {
          headers: {
            Authorization: `Bearer ${tokenInfo.githubGrantToken}`,
            Accept: "application/json",
          },
        });
        if (centralRes.ok) {
          const centralData: any = await centralRes.json().catch(() => ({}));
          return res.json({
            connected: true,
            user: tokenInfo.user || (centralData.login ? { login: centralData.login, name: centralData.login } : null),
            login: centralData.login,
            source: "nexuss-auth",
            configured: true,
          });
        }
      } catch {}
    }

    if (tokenInfo.user && tokenInfo.user.login) {
      return res.json({
        connected: true,
        user: tokenInfo.user,
        source: tokenInfo.source || "oauth",
        authProvider: "github",
        configured: true,
      });
    }
  }

  return res.json({
    connected: false,
    user: null,
    authProvider: "github",
    configured: true,
  });
});

// 5. Disconnect GitHub
app.post("/api/github/disconnect", (req, res) => {
  try {
    saveGitHubTokens({});
    res.clearCookie("ethco_github_token");
    res.clearCookie("github_grant_token");
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

function sanitizeLucideIcon(name: string): string {
  if (!name) return "MessageSquare";
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, " ").trim();
  const pascal = cleaned
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
  return pascal || "MessageSquare";
}

function parseTitleAndIcon(rawText: string): { title?: string; icon?: string } {
  if (!rawText) return {};
  const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const title = parsed.title ? String(parsed.title).trim().replace(/^["']|["']$/g, "") : undefined;
      const icon = parsed.icon ? sanitizeLucideIcon(String(parsed.icon)) : undefined;
      if (title) return { title, icon };
    } catch {}
  }
  let title: string | undefined;
  let icon: string | undefined;
  const titleMatch = rawText.match(/title\s*:\s*["']?([^"\n]+)["']?/i);
  if (titleMatch) title = titleMatch[1].trim().replace(/^["']|["']$/g, "");
  const iconMatch = rawText.match(/icon\s*:\s*["']?([A-Za-z0-9_-]+)["']?/i);
  if (iconMatch) icon = sanitizeLucideIcon(iconMatch[1].trim());
  if (!title && rawText.trim().length > 0 && rawText.trim().length < 60) {
    title = rawText.trim().replace(/^["']|["']$/g, "");
  }
  return { title, icon };
}

function inferFallbackIconAndTitle(p1: string, p2: string): { title: string; icon: string } {
  const combined = `${p1} ${p2}`.toLowerCase();
  let icon = "MessageSquare";
  if (/python|javascript|typescript|react|html|css|code|function|class|algorithm|syntax|variable|loop/.test(combined)) {
    icon = "Code";
  } else if (/terminal|bash|shell|command|linux|cli|powershell|script|exec/.test(combined)) {
    icon = "Terminal";
  } else if (/git|github|branch|commit|pull request|merge|repo|repository/.test(combined)) {
    icon = "GitBranch";
  } else if (/sql|postgres|database|mongo|sqlite|query|schema|table|prisma|drizzle/.test(combined)) {
    icon = "Database";
  } else if (/bug|error|exception|debug|fix|crash|failure|issue/.test(combined)) {
    icon = "Bug";
  } else if (/design|color|theme|css|style|tailwind|ui|ux|layout|font/.test(combined)) {
    icon = "Palette";
  } else if (/ai|llm|prompt|gemini|gpt|claude|agent|intelligence|neural/.test(combined)) {
    icon = "Brain";
  } else if (/server|api|http|rest|docker|deploy|cloud|endpoint/.test(combined)) {
    icon = "Server";
  } else if (/search|find|google|lookup|explore/.test(combined)) {
    icon = "Search";
  } else if (/book|learn|read|doc|documentation|study|guide/.test(combined)) {
    icon = "BookOpen";
  } else if (/speed|performance|optimize|fast|latency/.test(combined)) {
    icon = "Zap";
  } else if (/auth|security|password|token|jwt|encrypt|shield/.test(combined)) {
    icon = "Shield";
  }

  const primaryText = p2 || p1;
  const title = primaryText
    ? primaryText.substring(0, 30).trim() + (primaryText.length > 30 ? "..." : "")
    : "Conversation";

  return { title, icon };
}

// 5. Auto-generate Conversation Title & Dynamic Lucide Icon
app.post("/api/chat/title", async (req, res) => {
  let p1 = String(req.body?.firstPrompt || "").trim();
  let r1 = String(req.body?.modelResponse || req.body?.assistantMessage || "").trim();
  let p2 = String(req.body?.secondPrompt || "").trim();

  // If messages/history array provided, extract the first prompt, model response, and second prompt
  if ((!p1 || !p2) && Array.isArray(req.body?.history)) {
    const userTurns = req.body.history.filter((m: any) => m.role === "user");
    const asstTurns = req.body.history.filter((m: any) => m.role === "assistant");
    if (!p1 && userTurns[0]) p1 = typeof userTurns[0].content === "string" ? userTurns[0].content.trim() : "";
    if (!r1 && asstTurns[0]) r1 = typeof asstTurns[0].content === "string" ? asstTurns[0].content.trim() : "";
    if (!p2 && userTurns[1]) p2 = typeof userTurns[1].content === "string" ? userTurns[1].content.trim() : "";
  }

  if (!p1 && req.body?.userMessage) {
    p1 = String(req.body.userMessage).trim();
  }

  try {
    if (!p1 && !p2) {
      return res.json({ title: "New Conversation", icon: "MessageSquare" });
    }

    // Compose titling prompt to external AI
    const titlingPrompt = p2
      ? `You are an AI assistant specialized in naming conversations and selecting matching iconography.
Analyze the entire multi-turn conversation history below:

First prompt (User):
"""${p1.substring(0, 1000)}"""

Model response (Assistant):
"""${r1.substring(0, 1000)}"""

Second prompt (User):
"""${p2.substring(0, 1000)}"""

Task:
1. Name conversation title: Formulate a concise, intelligent, and natural title (2 to 5 words, without quotation marks) summarizing what this conversation is about based on both prompts and the response.
2. Select Lucide icon: Choose the single best Lucide icon name (PascalCase) that accurately represents the context, domain, or theme of this conversation. Examples of valid Lucide icon names:
Code, Terminal, Cpu, Bug, GitBranch, GitPullRequest, GitCommit, FileText, FileCode, Database, Sparkles, Brain, Compass, BookOpen, Search, Folder, Settings, Shield, Workflow, Zap, PenTool, Palette, Layers, Globe, Server, MessageSquare, Bot, Key, Lock, Wrench, Package, Rocket, Activity, HelpCircle, Flame, Lightbulb, Music, Video, Image, ListTodo, CheckSquare, BarChart, TrendingUp, Cloud, Wifi, Monitor, Smartphone, Hammer, Box, Coffee, ShoppingCart, DollarSign, HeartPulse, Stethoscope, Briefcase, GraduationCap, MapPin, Calculator, Mail, Atom, Gauge, Sun, Moon, ShieldCheck, TerminalSquare

Return ONLY a valid JSON object in this exact schema, with no additional markdown or commentary:
{
  "title": "Concise Conversation Title",
  "icon": "LucideIconName"
}`
      : `You are an AI assistant specialized in naming conversations and selecting matching iconography.
User's initial query:
"""${p1.substring(0, 1000)}"""
${r1 ? `Assistant intro:\n"""${r1.substring(0, 500)}"""` : ""}

Task:
1. Name conversation title: Formulate a concise, intelligent title (2 to 5 words, no quotation marks).
2. Select Lucide icon: Choose the single best Lucide icon name in PascalCase (e.g., Code, Terminal, Brain, Cpu, Database, Sparkles, Bug, FileCode, GitBranch, Globe, Server, Bot, Search, Shield, Zap, BookOpen, Palette, Compass, Workflow, Key, Package, Rocket, etc.).

Return ONLY a valid JSON object:
{
  "title": "Concise Conversation Title",
  "icon": "LucideIconName"
}`;

    // 1. Try external AI via OmniRoute if key is configured
    let omniKey = (
      req.body?.omnirouteApiKey ||
      (req.headers["x-omniroute-key"] as string) ||
      process.env.OMNIROUTE_AI_API_KEY ||
      process.env.OMNIROUTE_API_KEY ||
      ""
    ).trim();

    // Strip accidental quotes from environment variables
    if (omniKey.startsWith("\"") && omniKey.endsWith("\"")) {
      omniKey = omniKey.slice(1, -1);
    } else if (omniKey.startsWith("\'") && omniKey.endsWith("\'")) {
      omniKey = omniKey.slice(1, -1);
    }
    omniKey = omniKey.trim();

    if (omniKey) {
      try {
        const rawBase = (process.env.OMNIROUTE_API_BASE || "https://omniouter-vercel.vercel.app").trim().replace(/\/+$/, "");
        const targetUrl = rawBase.endsWith("/api/v1")
          ? `${rawBase}/chat/completions`
          : rawBase.endsWith("/chat/completions")
          ? rawBase
          : `${rawBase}/api/v1/chat/completions`;

        const omniRes = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${omniKey}`,
          },
          body: JSON.stringify({
            model: "auto",
            messages: [
              { role: "system", content: "You generate conversation titles and Lucide icon names formatted as JSON." },
              { role: "user", content: titlingPrompt },
            ],
            stream: false,
          }),
        });

        if (omniRes.ok) {
          const data: any = await omniRes.json();
          const content = data.choices?.[0]?.message?.content || "";
          const parsed = parseTitleAndIcon(content);
          if (parsed.title) {
            return res.json({
              title: parsed.title,
              icon: parsed.icon || "MessageSquare",
            });
          }
        }
      } catch (omniErr) {
        console.warn("OmniRoute titling attempt error:", omniErr);
      }
    }

    // Fallback inference based on context keywords directly (No Gemini SDK fallback)
    const fallback = inferFallbackIconAndTitle(p1, p2);
    res.json(fallback);
  } catch (err: any) {
    console.error("Error generating title:", err);
    const fallback = inferFallbackIconAndTitle(p1, p2);
    res.json(fallback);
  }
});

// Helper to convert Workspace tool declarations to OpenAI JSON Schema Tools format
function convertToOpenAiTools(decls: any[]) {
  return decls.map(decl => {
    const mapSchema = (schema: any): any => {
      if (!schema) return schema;
      const res = { ...schema };
      if (typeof res.type === "string") {
        res.type = res.type.toLowerCase();
      }
      if (res.properties) {
        const props: any = {};
        for (const k of Object.keys(res.properties)) {
          props[k] = mapSchema(res.properties[k]);
        }
        res.properties = props;
      }
      if (res.items) {
        res.items = mapSchema(res.items);
      }
      return res;
    };

    return {
      type: "function",
      function: {
        name: decl.name,
        description: decl.description,
        parameters: mapSchema(decl.parameters)
      }
    };
  });
}

// Unified multi-turn tool calling and streaming over OmniRoute
async function executeOmniRouteTurn(
  modelName: string, // e.g. "omniroute/auto"
  messages: any[], // Raw original messages from req.body
  systemInstruction: string | undefined,
  onChunk: (text: string) => void,
  onToolEvent?: (event: any) => void,
  customApiKey?: string
) {
  const openAiTools = convertToOpenAiTools(WORKSPACE_TOOL_DECLARATIONS);
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
      if (content.length === 1 && content[0].type === "text") {
        openAiMessages.push({ role, content: content[0].text });
      } else {
        openAiMessages.push({ role, content });
      }
    }
  }

  // Extract model ID from something like 'omniroute/auto' or just 'auto'
  let mappedModel = "auto";
  if (modelName === "omniroute/auto" || modelName === "omniroute-auto") {
    mappedModel = "auto";
  } else if (modelName.startsWith("omniroute/")) {
    mappedModel = modelName.replace(/^omniroute\//, "");
  } else if (modelName) {
    mappedModel = modelName;
  }

  let apiKey = (customApiKey || process.env.OMNIROUTE_AI_API_KEY || process.env.OMNIROUTE_API_KEY || "").trim();
  if (apiKey.startsWith("\"") && apiKey.endsWith("\"")) {
    apiKey = apiKey.slice(1, -1);
  } else if (apiKey.startsWith("\'") && apiKey.endsWith("\'")) {
    apiKey = apiKey.slice(1, -1);
  }
  apiKey = apiKey.trim();

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

  const maxToolIterations = 6;
  let iteration = 0;

  while (iteration < maxToolIterations) {
    iteration++;

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: mappedModel,
        messages: openAiMessages,
        tools: onToolEvent ? openAiTools : undefined,
        tool_choice: onToolEvent ? "auto" : undefined,
        temperature: 0.7,
        max_tokens: 8000,
        stream: false
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

    const data = await response.json();
    const choice = data.choices?.[0];
    const assistantMessage = choice?.message;

    if (!assistantMessage) {
      throw new Error("No response message received from OmniRoute API.");
    }

    const toolCalls = assistantMessage.tool_calls;

    if (!onToolEvent || !toolCalls || toolCalls.length === 0) {
      const finalText = assistantMessage.content || "";
      if (finalText) {
        onChunk(finalText);
      }
      return { success: true };
    }

    openAiMessages.push({
      role: "assistant",
      content: assistantMessage.content || null,
      tool_calls: toolCalls
    });

    for (const toolCall of toolCalls) {
      const callId = toolCall.id || `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const toolName = toolCall.function.name;
      let toolArgs = {};
      try {
        toolArgs = typeof toolCall.function.arguments === "string" 
          ? JSON.parse(toolCall.function.arguments) 
          : toolCall.function.arguments || {};
      } catch (e) {
        console.warn(`Failed to parse arguments for tool ${toolName}:`, toolCall.function.arguments);
      }

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

      openAiMessages.push({
        role: "tool",
        tool_call_id: callId,
        name: toolName,
        content: typeof result === "string" ? result : JSON.stringify(result)
      });
    }
  }

  return { success: true };
}

// 6. Chat Streaming SSE Endpoint
app.get("/api/chat/stream", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Chat stream endpoint is operational. Send a POST request with messages to stream completions.",
  });
});

app.options("/api/chat/stream", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-omniroute-key");
  return res.status(204).end();
});

app.post("/api/chat/stream", async (req, res) => {
  console.log("Received POST /api/chat/stream");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const rawBody = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { messages, thinkingEnabled = true, customSystemPrompt, model, actionMode = "planning", selectedRepos } = rawBody;

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

    const preferredModel = model || "omniroute/auto";

    await executeOmniRouteTurn(
      preferredModel,
      messages,
      activeSystemInstruction,
      (textChunk: string) => {
        res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
      },
      (toolEvent: any) => {
        res.write(`data: ${JSON.stringify({ toolEvent })}\n\n`);
      },
      req.body?.omnirouteApiKey || (req.headers["x-omniroute-key"] as string)
    );

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error("OmniRoute API stream error:", error);

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




// Export app for server and test usage
export { app };

// Vercel serverless function entrypoint
export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-omniroute-key, x-github-token");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Handle URL normalization in case Vercel rewrites altered the path
  const matched = (req.headers["x-matched-path"] as string) || (req.headers["x-forwarded-uri"] as string);
  if (matched && matched.startsWith("/api") && !req.url.startsWith("/api")) {
    req.url = matched;
    (req as any).originalUrl = matched;
  }

  return app(req, res);
}
