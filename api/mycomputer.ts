import { ComputerClient, VirtualFs } from "@nexuss0781/mycomputer";
import type { Dirent } from "fs";

export const MYCOMPUTER_DEFAULT_BASE_URL = "https://nexuss-computer.vercel.app";
export const MYCOMPUTER_SESSION_NAME = "ethco-agent";
export const MYCOMPUTER_TOOL_PREFIX = "mc";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
}

let clientPromise: Promise<ComputerClient> | null = null;
let sessionPromise: Promise<string> | null = null;
let virtualFs: VirtualFs | null = null;

function getBaseUrl(): string {
  return process.env.MYCOMPUTER_BASE_URL || MYCOMPUTER_DEFAULT_BASE_URL;
}

async function ensureClient(): Promise<ComputerClient> {
  if (!clientPromise) {
    const client = new ComputerClient({ baseUrl: getBaseUrl() });
    clientPromise = (async () => {
      const ping = await client.ping();
      console.log(`[mycomputer] connected to ${client.baseUrl}: ${JSON.stringify(ping)}`);
      return client;
    })();
  }
  return clientPromise;
}

async function ensureSession(): Promise<string> {
  if (!sessionPromise) {
    const client = await ensureClient();
    const preferred = process.env.MYCOMPUTER_SESSION_ID;
    if (preferred) {
      sessionPromise = Promise.resolve(preferred);
    } else {
      const sessions = await client.listSessions();
      const existing = sessions.find((s) => s.name === MYCOMPUTER_SESSION_NAME);
      if (existing) {
        sessionPromise = Promise.resolve(existing.id);
      } else {
        const created = await client.createSession({ name: MYCOMPUTER_SESSION_NAME });
        sessionPromise = Promise.resolve(created.id);
      }
    }
    const id = await sessionPromise;
    console.log(`[mycomputer] using session ${id}`);
  }
  return sessionPromise;
}

export async function getVirtualFs(): Promise<VirtualFs> {
  if (virtualFs) return virtualFs;
  const client = await ensureClient();
  const sessionId = await ensureSession();
  virtualFs = client.mountFs(sessionId, { flushOnWrite: false });
  return virtualFs;
}

export async function getSessionId(): Promise<string> {
  return ensureSession();
}

export async function getBaseUrlValue(): Promise<string> {
  await ensureClient();
  return getBaseUrl();
}

export async function getComputerClient(): Promise<ComputerClient> {
  return ensureClient();
}

function arrToString(arr: any[]): string {
  return arr.map((x) => `${x.name}${x.type === "directory" ? "/" : ""}`).join("\n");
}

async function fsList(pathValue: string, recursive: boolean): Promise<any> {
  const fs = await getVirtualFs();
  const dirents = (await fs.readdir(pathValue, { withFileTypes: true })) as Dirent[];
  const items = [];
  for (const d of dirents) {
    const full = pathValue.endsWith("/") ? `${pathValue}${d.name}` : `${pathValue}/${d.name}`;
    const base: any = { name: d.name, type: d.isDirectory() ? "directory" : "file" };
    if (d.isDirectory()) {
      if (recursive) {
        base.children = await fsList(full, true);
      }
    } else {
      try {
        const st = await fs.stat(full);
        base.size = st.size;
      } catch {}
    }
    items.push(base);
  }
  return items;
}

async function fsRead(pathValue: string): Promise<string> {
  const fs = await getVirtualFs();
  const buf = await fs.readFile(pathValue);
  return buf.toString("utf-8");
}

async function fsWrite(pathValue: string, content: string): Promise<void> {
  const fs = await getVirtualFs();
  await fs.writeFile(pathValue, content, { flag: "w" });
}

export const MYCOMPUTER_TOOL_DECLARATIONS: ToolDefinition[] = [
  {
    name: "mc_write",
    description: "Write content to a file inside the virtual filesystem (my-computer, hosted on Vercel). Automatically creates parent directories. Overwrites existing file.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING", description: "Absolute or root-relative path in the virtual filesystem, e.g. '/home/notes.md'" },
        content: { type: "STRING", description: "The content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "mc_read",
    description: "Read a file from the virtual filesystem (my-computer, hosted on Vercel) as text.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING", description: "Path in the virtual filesystem, e.g. '/home/notes.md'" },
      },
      required: ["path"],
    },
  },
  {
    name: "mc_append",
    description: "Append content to a file in the virtual filesystem (my-computer). Creates the file if it does not exist.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING", description: "Path in the virtual filesystem" },
        content: { type: "STRING", description: "The content to append" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "mc_list",
    description: "List the contents of a directory in the virtual filesystem (my-computer, hosted on Vercel).",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING", description: "Directory path in the virtual filesystem, defaults to '/' (root)" },
        recursive: { type: "BOOLEAN", description: "List subdirectories recursively (defaults to false)" },
      },
    },
  },
  {
    name: "mc_stat",
    description: "Get metadata (size, type, modified time) for a path in the virtual filesystem.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING", description: "Path in the virtual filesystem" },
      },
      required: ["path"],
    },
  },
  {
    name: "mc_mkdir",
    description: "Create a directory in the virtual filesystem.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING", description: "Directory path in the virtual filesystem" },
        recursive: { type: "BOOLEAN", description: "Create parent directories as needed (defaults to true)" },
      },
      required: ["path"],
    },
  },
  {
    name: "mc_rm",
    description: "Remove a file or directory from the virtual filesystem.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: { type: "STRING", description: "Path in the virtual filesystem" },
        recursive: { type: "BOOLEAN", description: "Recursively delete (defaults to true)" },
        force: { type: "BOOLEAN", description: "Ignore missing paths (defaults to true)" },
      },
      required: ["path"],
    },
  },
  {
    name: "mc_mv",
    description: "Move (rename) a file or directory within the virtual filesystem.",
    parameters: {
      type: "OBJECT",
      properties: {
        from: { type: "STRING", description: "Current path" },
        to: { type: "STRING", description: "Destination path" },
      },
      required: ["from", "to"],
    },
  },
  {
    name: "mc_cp",
    description: "Copy a file within the virtual filesystem.",
    parameters: {
      type: "OBJECT",
      properties: {
        src: { type: "STRING", description: "Source path" },
        dest: { type: "STRING", description: "Destination path" },
      },
      required: ["src", "dest"],
    },
  },
  {
    name: "mc_fsync",
    description: "Flush buffered writes in the virtual filesystem to persistent storage (durability point).",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
];

export async function executeMyComputerTool(name: string, args: Record<string, any>): Promise<any> {
  try {
    switch (name) {
      case "mc_write": {
        const p = args.path;
        if (!p || typeof p !== "string") return { error: "path is required and must be a string." };
        const content = typeof args.content === "string" ? args.content : String(args.content ?? "");
        await fsWrite(p, content);
        return { ok: true, action: "written", path: p, byteSize: Buffer.byteLength(content, "utf-8") };
      }

      case "mc_read": {
        const p = args.path;
        if (!p || typeof p !== "string") return { error: "path is required and must be a string." };
        const content = await fsRead(p);
        return { ok: true, path: p, byteSize: Buffer.byteLength(content, "utf-8"), content };
      }

      case "mc_append": {
        const p = args.path;
        if (!p || typeof p !== "string") return { error: "path is required and must be a string." };
        const content = typeof args.content === "string" ? args.content : String(args.content ?? "");
        const fs = await getVirtualFs();
        await fs.appendFile(p, content);
        return { ok: true, action: "appended", path: p, appendedBytes: Buffer.byteLength(content, "utf-8") };
      }

      case "mc_list": {
        const p = (args.path || "/") as string;
        const recursive = Boolean(args.recursive);
        const items = await fsList(p, recursive);
        return {
          ok: true,
          directory: p,
          itemsCount: items.length,
          items,
          summary: arrToString(items as any[]),
        };
      }

      case "mc_stat": {
        const p = args.path;
        if (!p || typeof p !== "string") return { error: "path is required and must be a string." };
        const fs = await getVirtualFs();
        const st = await fs.stat(p);
        return {
          ok: true,
          path: p,
          type: st.isDirectory() ? "directory" : "file",
          size: st.size,
          modifiedAt: st.mtime.toISOString(),
          createdAt: st.birthtime.toISOString(),
        };
      }

      case "mc_mkdir": {
        const p = args.path;
        if (!p || typeof p !== "string") return { error: "path is required and must be a string." };
        const fs = await getVirtualFs();
        const res = await fs.mkdir(p, { recursive: args.recursive !== undefined ? Boolean(args.recursive) : true });
        return { ok: true, action: "mkdir", path: p, createdPath: res ?? null };
      }

      case "mc_rm": {
        const p = args.path;
        if (!p || typeof p !== "string") return { error: "path is required and must be a string." };
        const fs = await getVirtualFs();
        await fs.rm(p, {
          recursive: args.recursive !== undefined ? Boolean(args.recursive) : true,
          force: args.force !== undefined ? Boolean(args.force) : true,
        });
        return { ok: true, action: "removed", path: p };
      }

      case "mc_mv": {
        const from = args.from;
        const to = args.to;
        if (!from || !to || typeof from !== "string" || typeof to !== "string") {
          return { error: "from and to are required and must be strings." };
        }
        const fs = await getVirtualFs();
        await fs.rename(from, to);
        return { ok: true, action: "moved", from, to };
      }

      case "mc_cp": {
        const src = args.src;
        const dest = args.dest;
        if (!src || !dest || typeof src !== "string" || typeof dest !== "string") {
          return { error: "src and dest are required and must be strings." };
        }
        const fs = await getVirtualFs();
        await fs.copyFile(src, dest);
        return { ok: true, action: "copied", src, dest };
      }

      case "mc_fsync": {
        const client = await ensureClient();
        const sessionId = await ensureSession();
        await client.fsync(sessionId);
        return { ok: true, action: "fsync", message: "Virtual filesystem flushed to persistent storage." };
      }

      default:
        return { error: `Tool "${name}" is not a mycomputer tool.` };
    }
  } catch (err: any) {
    console.error(`[mycomputer] tool ${name} error:`, err);
    return { error: `${err?.message || err}` };
  }
}