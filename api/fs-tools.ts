import { glob, grep, list, modify, read, remove, write } from "filesystem-kit";

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

const FS_TOOLS: ToolDefinition[] = [
  declare("read", "Read a local workspace file as line-numbered content.", {
    path: { type: "STRING", description: "The path to the file to read" },
    offset: { type: "INTEGER", description: "The line number to start from (1-indexed)" },
    limit: { type: "INTEGER", description: "The maximum number of lines to read (defaults to 2000)" },
    startLine: { type: "INTEGER", description: "Line to start reading at (1-indexed)" },
    endLine: { type: "INTEGER", description: "Line to stop reading at (inclusive)" },
  }, ["path"]),
  declare("write", "Write content to a local workspace file. Creates parent directories and overwrites the file.", {
    path: { type: "STRING", description: "The path of the file to write" },
    content: { type: "STRING", description: "The content to write" },
    overwrite: { type: "BOOLEAN", description: "Accepted for compatibility; writes always replace the target" },
  }, ["path", "content"]),
  declare("edit", "Apply an exact string replacement to a local workspace file.", {
    path: { type: "STRING", description: "The path of the file to edit" },
    oldString: { type: "STRING", description: "The exact string to replace" },
    newString: { type: "STRING", description: "The replacement content" },
    replaceAll: { type: "BOOLEAN", description: "Replace all occurrences (default false)" },
    targetContent: { type: "STRING", description: "Alias for oldString" },
    replacementContent: { type: "STRING", description: "Alias for newString" },
  }, ["path", "oldString", "newString"]),
  declare("delete", "Delete a local workspace file or directory using the File System Kit remove API.", {
    path: { type: "STRING", description: "The file or directory path to remove" },
    recursive: { type: "BOOLEAN", description: "Recursively remove a directory" },
    force: { type: "BOOLEAN", description: "Ignore a missing path" },
  }, ["path"]),
  declare("glob", "Find local workspace paths using a glob pattern.", {
    pattern: { type: "STRING", description: "The file pattern, e.g. '**/*.ts'" },
    path: { type: "STRING", description: "Directory to search in (defaults to the workspace)" },
  }, ["pattern"]),
  declare("grep", "Search local workspace files using a regular expression.", {
    pattern: { type: "STRING", description: "The regex pattern to search for" },
    include: { type: "STRING", description: "File pattern filter, e.g. '*.ts'" },
    path: { type: "STRING", description: "Directory or file to search" },
  }, ["pattern"]),
  declare("list_directory", "List files and directories in the local workspace.", {
    path: { type: "STRING", description: "The directory to list (defaults to the workspace)" },
    directoryPath: { type: "STRING", description: "Alias for path" },
    recursive: { type: "BOOLEAN", description: "List subdirectories recursively" },
  }, []),
];

export const FS_TOOL_DECLARATIONS: ToolDefinition[] = FS_TOOLS;
export const FS_TOOL_NAMES: ReadonlySet<string> = new Set(FS_TOOLS.map((tool) => tool.name));

const IGNORED_DIRS = new Set(["node_modules", ".git", ".next", "dist", ".cache", ".turbo", "build"]);
const MAX_DEPTH = 10;

function workspaceCwd(rawCwd: unknown): string | undefined {
  return typeof rawCwd === "string" && rawCwd.trim() ? rawCwd : undefined;
}

function lineOptions(args: Record<string, any>): Record<string, any> {
  const start = typeof args.startLine === "number" ? args.startLine : args.offset;
  const end = typeof args.endLine === "number"
    ? args.endLine
    : typeof start === "number" && typeof args.limit === "number"
      ? start + args.limit - 1
      : undefined;
  if (typeof start === "number" || typeof end === "number") {
    return { range: { start: start ?? 1, end: end ?? start } };
  }
  return typeof args.limit === "number" ? { head: args.limit } : {};
}

function globOptions(pathValue: unknown): Record<string, any> {
  return { cwd: workspaceCwd(pathValue) };
}

async function listTree(directory: string, depth = 0): Promise<any[]> {
  if (depth > MAX_DEPTH) return [];
  const entries = await list(directory);
  const items: any[] = [];
  for (const entry of entries) {
    const relativePath = entry.path.replace(/^\/+/, "");
    if (entry.type === "directory" && IGNORED_DIRS.has(entry.name)) continue;
    const item: any = { name: entry.name, path: relativePath, type: entry.type };
    if (entry.type === "directory" && depth < MAX_DEPTH) {
      item.children = await listTree(entry.path, depth + 1);
    }
    items.push(item);
  }
  return items;
}

export async function executeFsTool(name: string, args: Record<string, any>): Promise<any> {
  if (!FS_TOOL_NAMES.has(name)) {
    return { error: `\"${name}\" is not a filesystem tool.` };
  }

  try {
    switch (name) {
      case "read": {
        const rawPath = args.path || args.filePath;
        if (!rawPath || typeof rawPath !== "string") return { error: "path or filePath is required." };
        const content = await read(rawPath, lineOptions(args));
        const lines = content.split("\n");
        const startLine = typeof args.startLine === "number" ? args.startLine : typeof args.offset === "number" ? args.offset : 1;
        return { path: rawPath, totalLines: lines.length, startLine, endLine: startLine + lines.length - 1, content: lines.map((line, index) => `${startLine + index}: ${line}`).join("\n"), byteSize: Buffer.byteLength(content) };
      }

      case "write": {
        const rawPath = args.path || args.filePath;
        if (!rawPath || typeof rawPath !== "string") return { error: "path or filePath is required." };
        const content = typeof args.content === "string" ? args.content : String(args.content ?? "");
        const result = await write(rawPath, content);
        return { success: true, action: "written", path: result.path, byteSize: result.bytes };
      }

      case "edit": {
        const rawPath = args.path || args.filePath;
        if (!rawPath || typeof rawPath !== "string") return { error: "path or filePath is required." };
        const targetContent = args.targetContent ?? args.oldString;
        const replacementContent = args.replacementContent ?? args.newString ?? "";
        if (typeof targetContent !== "string" || !targetContent) return { error: "targetContent (or oldString) must be a non-empty string." };
        if (Boolean(args.replaceAll)) {
          const raw = await read(rawPath);
          if (!raw.includes(targetContent)) return { error: "targetContent (or oldString) not found in file." };
          const updated = raw.split(targetContent).join(replacementContent);
          await write(rawPath, updated);
          return { success: true, action: "modified", path: rawPath, matchesReplaced: raw.split(targetContent).length - 1 };
        }
        const result = await modify(rawPath, { match: targetContent, replacement: String(replacementContent) });
        return { success: true, action: "modified", path: result.path, matchesReplaced: result.replacements };
      }

      case "delete": {
        const rawPath = args.path || args.filePath;
        if (!rawPath || typeof rawPath !== "string") return { error: "path or filePath is required." };
        return await remove(rawPath, { recursive: Boolean(args.recursive), force: Boolean(args.force) });
      }

      case "glob": {
        if (typeof args.pattern !== "string" || !args.pattern) return { error: "pattern is required and must be a string." };
        const matches = await glob(args.pattern, globOptions(args.path));
        return { pattern: args.pattern, path: args.path || ".", totalMatches: matches.length, matches };
      }

      case "grep": {
        if (typeof args.pattern !== "string" || !args.pattern) return { error: "pattern is required and must be a string." };
        let pattern: string | RegExp = args.pattern;
        try { pattern = new RegExp(args.pattern, "i"); } catch { /* File System Kit accepts literal strings too. */ }
        const results = await grep(pattern, { path: args.path || "." });
        const filtered = args.include ? results.filter((match: any) => match.path.endsWith(args.include) || match.path.includes(args.include)) : results;
        const matches = filtered.slice(0, 100).map((match: any) => ({ path: match.path, lineNumber: match.line, line: match.text }));
        return { pattern: args.pattern, path: args.path || ".", include: args.include, totalMatches: filtered.length, matches, formatted: matches.slice(0, 50).map((m: any) => `${m.path}:${m.lineNumber}: ${m.line}`).join("\n") || "No matching lines found." };
      }

      case "list_directory": {
        const directory = args.directoryPath || args.path || ".";
        const items = Boolean(args.recursive) ? await listTree(directory) : await list(directory);
        return { directory, itemsCount: items.length, items };
      }

      default:
        return { error: `Unhandled filesystem tool \"${name}\".` };
    }
  } catch (err: any) {
    console.error(`[fs-tools] tool ${name} error:`, err);
    return { error: err?.message || `Failed to execute tool \"${name}\"` };
  }
}
