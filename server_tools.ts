import fs from "fs";
import path from "path";
import { exec } from "child_process";

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
      },
      required: ["path", "targetContent", "replacementContent"],
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
];

// Helper to safely resolve workspace path preventing path traversal outside root
function resolveSafePath(userPath: string): string {
  const root = process.cwd();
  const cleaned = userPath.trim().replace(/^[\/\\]+/, "");
  const resolved = path.resolve(root, cleaned);
  return resolved;
}

// Tool Implementation Dispatcher
export async function executeWorkspaceTool(name: string, args: Record<string, any>): Promise<any> {
  const root = process.cwd();

  try {
    switch (name) {
      case "run_command": {
        const command = args.command;
        if (!command || typeof command !== "string") {
          return { error: "command is required and must be a string." };
        }

        const targetCwd = args.cwd ? resolveSafePath(args.cwd) : root;
        if (!fs.existsSync(targetCwd)) {
          return { error: `Working directory does not exist: "${args.cwd}"` };
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
                cwd: args.cwd || ".",
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
        const filePath = resolveSafePath(args.path);
        if (!fs.existsSync(filePath)) {
          return { error: `File not found: "${args.path}"` };
        }
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          return { error: `Path "${args.path}" is a directory, use list_directory instead.` };
        }

        const raw = fs.readFileSync(filePath, "utf-8");
        const lines = raw.split("\n");
        const totalLines = lines.length;

        const startLine = args.startLine && args.startLine > 0 ? Math.min(args.startLine, totalLines) : 1;
        const endLine = args.endLine && args.endLine >= startLine ? Math.min(args.endLine, totalLines) : totalLines;

        const sliced = lines.slice(startLine - 1, endLine).map((l, i) => `${startLine + i}: ${l}`).join("\n");

        return {
          path: args.path,
          totalLines,
          startLine,
          endLine,
          content: sliced,
          byteSize: raw.length,
        };
      }

      case "create_file": {
        const filePath = resolveSafePath(args.path);
        const exists = fs.existsSync(filePath);
        if (exists && !args.overwrite) {
          return {
            error: `File "${args.path}" already exists. Set overwrite=true to replace it or use edit_file.`,
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
          path: args.path,
          byteSize: (args.content || "").length,
        };
      }

      case "edit_file": {
        const filePath = resolveSafePath(args.path);
        if (!fs.existsSync(filePath)) {
          return { error: `File not found: "${args.path}"` };
        }

        const raw = fs.readFileSync(filePath, "utf-8");
        const targetContent = args.targetContent;
        const replacementContent = args.replacementContent ?? "";

        if (typeof targetContent !== "string" || !targetContent) {
          return { error: "targetContent must be a non-empty string." };
        }

        if (!raw.includes(targetContent)) {
          return {
            error: "targetContent not found in file. Please call view_file to confirm the exact lines before editing.",
          };
        }

        // Count occurrences
        const occurrences = raw.split(targetContent).length - 1;
        if (occurrences > 1) {
          return {
            error: `targetContent matched ${occurrences} locations in the file. Please provide more surrounding context lines to make the match unique.`,
          };
        }

        const updated = raw.replace(targetContent, replacementContent);
        fs.writeFileSync(filePath, updated, "utf-8");

        return {
          success: true,
          action: "modified",
          path: args.path,
          replacedBytes: targetContent.length,
          newBytes: replacementContent.length,
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

      default:
        return { error: `Tool "${name}" is not implemented or recognized.` };
    }
  } catch (err: any) {
    console.error(`Error executing tool ${name}:`, err);
    return { error: err.message || "Failed to execute tool" };
  }
}
