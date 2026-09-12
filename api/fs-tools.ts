import path from "path";
import type { VirtualFs, VirtualFsDirent } from "@nexuss0781/mycomputer";
import {
  getComputerClient,
  getSessionId,
  getVirtualFs,
} from "./mycomputer.js";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

type Prop = { type: string; description: string };

function declare(
  name: string,
  description: string,
  properties: Record<string, Prop>,
  required: string[],
): ToolDefinition {
  return { name, description, parameters: { type: "OBJECT", properties, required } };
}

const P = path.posix;

const FS_TOOLS: ToolDefinition[] = [
  declare("bash", "Execute a shell command (git, node, npm, curl, grep, cat, ls...) on the persistent virtual filesystem (my-computer virtual disk). Runs in the sandboxed executor; the working directory is the persistent virtual workspace.", {
    command: { type: "STRING", description: "The command line string to execute" },
    cwd: { type: "STRING", description: "Working directory on the virtual disk (defaults to the virtual workspace root)" },
    timeout: { type: "INTEGER", description: "Execution timeout in milliseconds (defaults to 30000 ms)" },
  }, ["command"]),
  declare("read", "Read a file from the persistent virtual filesystem (my-computer virtual disk). Content is line-numbered.", {
    path: { type: "STRING", description: "The path to the file to read" },
    offset: { type: "INTEGER", description: "The line number to start from (1-indexed)" },
    limit: { type: "INTEGER", description: "The maximum number of lines to read (defaults to 2000)" },
    startLine: { type: "INTEGER", description: "Line to start reading at (1-indexed)" },
    endLine: { type: "INTEGER", description: "Line to stop reading at (inclusive)" },
  }, ["path"]),
  declare("write", "Write content to a file on the persistent virtual filesystem (my-computer virtual disk). Creates parent directories; refuses to overwrite unless overwrite=true.", {
    path: { type: "STRING", description: "The path of the file to write" },
    content: { type: "STRING", description: "The content to write" },
    overwrite: { type: "BOOLEAN", description: "Set to true to overwrite an existing file (defaults to false)" },
  }, ["path", "content"]),
  declare("edit", "Apply exact string replacements to a file on the persistent virtual filesystem (my-computer virtual disk).", {
    path: { type: "STRING", description: "The path of the file to edit" },
    oldString: { type: "STRING", description: "The exact string to replace" },
    newString: { type: "STRING", description: "The replacement content" },
    replaceAll: { type: "BOOLEAN", description: "Replace all occurrences (default false)" },
    targetContent: { type: "STRING", description: "Alias for oldString" },
    replacementContent: { type: "STRING", description: "Alias for newString" },
  }, ["path", "oldString", "newString"]),
  declare("glob", "Fast file pattern matching on the persistent virtual filesystem (my-computer virtual disk).", {
    pattern: { type: "STRING", description: "The glob pattern, e.g. '**/*.ts', 'src/**/*.{ts,tsx}'" },
    path: { type: "STRING", description: "Directory to search in (defaults to the virtual disk root)" },
  }, ["pattern"]),
  declare("grep", "Fast content search over the persistent virtual filesystem (my-computer virtual disk) using a regex.", {
    pattern: { type: "STRING", description: "The regex pattern to search for" },
    include: { type: "STRING", description: "File pattern filter, e.g. '*.ts'" },
    path: { type: "STRING", description: "Directory to search in (defaults to the virtual disk root)" },
  }, ["pattern"]),
  declare("list_directory", "List the files and subdirectories of a directory on the persistent virtual filesystem (my-computer virtual disk).", {
    path: { type: "STRING", description: "The directory to list (defaults to the virtual disk root)" },
    directoryPath: { type: "STRING", description: "Alias for path" },
    recursive: { type: "BOOLEAN", description: "List recursively (default false)" },
  }, []),
];

export const FS_TOOL_DECLARATIONS: ToolDefinition[] = FS_TOOLS;
export const FS_TOOL_NAMES: ReadonlySet<string> = new Set(FS_TOOLS.map((t) => t.name));

const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", "dist", ".cache", ".turbo", "build"]);
const MAX_DEPTH = 8;

function cleanPath(raw: string): string {
  const trimmed = (raw || "").trim().replace(/\\/g, "/");
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function joinPath(dir: string, name: string): string {
  return P.join(cleanPath(dir), name);
}

async function pathExists(fs: VirtualFs, p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

function globMatch(filepath: string, pattern: string): boolean {
  let p = pattern.trim().replace(/^[./\\]+/, "");
  p = p.replace(/\{([^}]+)\}/g, (_, group: string) => `(${group.split(",").map((s: string) => s.trim()).join("|")})`);
  const escaped = p
    .replace(/[.+^$[\]]/g, "\\$&")
    .replace(/\*\*\//g, "(?:.*\\/)?")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^\\/]*")
    .replace(/\?/g, "[^\\/]");
  const regex = new RegExp(`^${escaped}$`, "i");
  const normalizedFile = filepath.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  return regex.test(normalizedFile) || regex.test(P.basename(normalizedFile));
}

async function walkDir(
  fs: VirtualFs,
  dir: string,
  depth: number,
  onFile: (fullPath: string) => Promise<void> | void,
): Promise<void> {
  if (depth > MAX_DEPTH) return;
  let entries: VirtualFsDirent[];
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true })) as VirtualFsDirent[];
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walkDir(fs, joinPath(dir, entry.name), depth + 1, onFile);
    } else if (entry.isFile()) {
      await onFile(joinPath(dir, entry.name));
    }
  }
}

export async function executeFsTool(name: string, args: Record<string, any>): Promise<any> {
  if (!FS_TOOL_NAMES.has(name)) {
    return { error: `"${name}" is not a persistent filesystem tool.` };
  }
  try {
    switch (name) {
      case "bash": {
        const command = args.command;
        if (typeof command !== "string" || !command.trim()) {
          return { error: "command is required and must be a string." };
        }
        const rawCwd = typeof args.cwd === "string" ? args.cwd : typeof args.workdir === "string" ? args.workdir : undefined;
        const timeoutMs = typeof args.timeout === "number" && args.timeout > 0 ? Math.min(args.timeout, 120000) : 30000;
        const client = await getComputerClient();
        const sessionId = await getSessionId();
        const execResult = await client.exec(sessionId, command, { cwd: rawCwd, timeout: timeoutMs });
        const exitCode = typeof execResult.exitCode === "number" ? execResult.exitCode : 1;
        return {
          command,
          cwd: rawCwd || ".",
          stdout: execResult.stdout || "",
          stderr: execResult.stderr || "",
          exitCode,
          executionTimeMs: execResult.durationMs || 0,
          killed: Boolean(execResult.timedOut),
          timedOut: Boolean(execResult.timedOut),
          truncated: Boolean(execResult.truncated),
          success: exitCode === 0,
        };
      }

      case "read": {
        const rawPath = args.path || args.filePath;
        if (!rawPath || typeof rawPath !== "string") {
          return { error: "path or filePath is required." };
        }
        const p = cleanPath(rawPath);
        const fs = await getVirtualFs();
        try {
          const st = await fs.stat(p);
          if (st.isDirectory()) {
            return { error: `Path "${rawPath}" is a directory, use list_directory instead.` };
          }
        } catch {}
        let raw: string;
        try {
          raw = (await fs.readFile(p)).toString("utf-8");
        } catch {
          return { error: `File not found: "${rawPath}"` };
        }
        const lines = raw.split("\n");
        const totalLines = lines.length;
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
        return { path: rawPath, totalLines, startLine, endLine, content: sliced, byteSize: raw.length };
      }

      case "write": {
        const rawPath = args.path || args.filePath;
        if (!rawPath || typeof rawPath !== "string") {
          return { error: "path or filePath is required." };
        }
        const p = cleanPath(rawPath);
        const content = typeof args.content === "string" ? args.content : String(args.content ?? "");
        const fs = await getVirtualFs();
        const exists = await pathExists(fs, p);
        const shouldOverwrite = args.overwrite !== undefined ? Boolean(args.overwrite) : false;
        if (exists && !shouldOverwrite) {
          return { error: `File "${rawPath}" already exists. Set overwrite=true to replace it or use edit.` };
        }
        const dir = P.dirname(p);
        if (dir && dir !== "/") {
          try { await fs.mkdir(dir, { recursive: true }); } catch {}
        }
        await fs.writeFile(p, content, { flag: "w" });
        return { success: true, action: exists ? "overwritten" : "created", path: rawPath, byteSize: content.length };
      }

      case "edit": {
        const rawPath = args.path || args.filePath;
        if (!rawPath || typeof rawPath !== "string") {
          return { error: "path or filePath is required." };
        }
        const p = cleanPath(rawPath);
        const fs = await getVirtualFs();
        let raw: string;
        try {
          raw = (await fs.readFile(p)).toString("utf-8");
        } catch {
          return { error: `File not found: "${rawPath}"` };
        }
        const targetContent = args.targetContent ?? args.oldString;
        const replacementContent = args.replacementContent ?? args.newString ?? "";
        if (typeof targetContent !== "string" || !targetContent) {
          return { error: "targetContent (or oldString) must be a non-empty string." };
        }
        if (!raw.includes(targetContent)) {
          return { error: "targetContent (or oldString) not found in file. Please call read to confirm the exact lines before editing." };
        }
        const occurrences = raw.split(targetContent).length - 1;
        const replaceAll = Boolean(args.replaceAll);
        if (occurrences > 1 && !replaceAll) {
          return { error: `Found ${occurrences} matches for target content. Provide more surrounding context lines or set replaceAll=true.` };
        }
        const updated = replaceAll
          ? raw.split(targetContent).join(replacementContent)
          : raw.replace(targetContent, replacementContent);
        await fs.writeFile(p, updated, { flag: "w" });
        return {
          success: true,
          action: "modified",
          path: rawPath,
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
        const searchRaw = args.path || ".";
        const searchDir = cleanPath(searchRaw);
        const fs = await getVirtualFs();
        const matched: string[] = [];
        await walkDir(fs, searchDir, 0, (full) => {
          if (globMatch(full, rawPattern)) matched.push(full);
        });
        return { pattern: rawPattern, path: searchRaw, totalMatches: matched.length, matches: matched };
      }

      case "grep": {
        const rawPattern = args.pattern;
        if (!rawPattern || typeof rawPattern !== "string") {
          return { error: "pattern is required and must be a string." };
        }
        const searchRaw = args.path || ".";
        const searchDir = cleanPath(searchRaw);
        const includePattern = args.include;
        let regex: RegExp;
        try {
          regex = new RegExp(rawPattern, "i");
        } catch {
          regex = new RegExp(rawPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        }
        const fs = await getVirtualFs();
        const matches: Array<{ path: string; lineNumber: number; line: string }> = [];
        await walkDir(fs, searchDir, 0, async (full) => {
          if (matches.length >= 200) return;
          if (includePattern && !globMatch(full, includePattern)) return;
          let buf: Buffer;
          try {
            buf = await fs.readFile(full);
          } catch {
            return;
          }
          if (buf.length > 2 * 1024 * 1024) return;
          if (buf.includes(0)) return;
          const lines = buf.toString("utf-8").split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= 200) break;
            if (regex.test(lines[i])) {
              matches.push({ path: full, lineNumber: i + 1, line: lines[i].trim() });
            }
          }
        });
        const formatted = matches.slice(0, 50).map((m) => `${m.path}:${m.lineNumber}: ${m.line}`).join("\n");
        return {
          pattern: rawPattern,
          path: searchRaw,
          include: includePattern,
          totalMatches: matches.length,
          matches: matches.slice(0, 100),
          formatted: formatted || "No matching lines found.",
        };
      }

      case "list_directory": {
        const rawPath = args.directoryPath || args.path || ".";
        const p = cleanPath(rawPath);
        const recursive = Boolean(args.recursive);
        const fs = await getVirtualFs();

        const scan = async (dir: string, depth: number): Promise<any[]> => {
          if (depth > 10) return [];
          let entries: VirtualFsDirent[];
          try {
            entries = (await fs.readdir(dir, { withFileTypes: true })) as VirtualFsDirent[];
          } catch {
            return [];
          }
          const list: any[] = [];
          for (const entry of entries) {
            const rel = joinPath(dir, entry.name).replace(/^\/+/, "");
            if (entry.isDirectory()) {
              if (IGNORED_DIRS.has(entry.name)) continue;
              const item: any = { name: entry.name, path: rel, type: "directory" };
              if (recursive) item.children = await scan(joinPath(dir, entry.name), depth + 1);
              list.push(item);
            } else if (entry.isFile()) {
              const item: any = { name: entry.name, path: rel, type: "file" };
              try {
                item.size = (await fs.stat(joinPath(dir, entry.name))).size;
              } catch {}
              list.push(item);
            }
          }
          return list;
        };

        const items = await scan(p, 0);
        return { directory: rawPath, itemsCount: items.length, items };
      }

      default:
        return { error: `Unhandled filesystem tool "${name}".` };
    }
  } catch (err: any) {
    console.error(`[fs-tools] tool ${name} error:`, err);
    return { error: err?.message || `Failed to execute tool "${name}"` };
  }
}