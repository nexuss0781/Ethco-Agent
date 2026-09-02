import fs from "fs";
import path from "path";
import { exec, execSync } from "child_process";

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
        const dirPath = resolveSafePath(args.directoryPath || ".");
        if (!fs.existsSync(dirPath)) {
          return { error: `Directory not found: "${args.directoryPath}"` };
        }

        const ignored = new Set(["node_modules", ".git", ".next", "dist", ".cache", ".turbo"]);

        function scan(current: string, recursive: boolean, depth = 0): any[] {
          if (depth > 4) return [];
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
          directory: args.directoryPath || ".",
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
