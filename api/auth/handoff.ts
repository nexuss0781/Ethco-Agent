import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";
import { saveGrant } from "../github/_grant.js";

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function value(req: VercelRequest, name: string): string {
  const item = (req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}

function userFrom(raw: any) {
  const user = raw?.user || raw?.data?.user || raw?.data || raw || {};
  return {
    id: String(user.id || user.userId || "nexuss-temp-user"),
    email: String(user.email || ""),
    name: String(user.name || user.login || ""),
    avatarUrl: user.avatarUrl ? String(user.avatarUrl) : null,
    githubLogin: user.login || user.githubLogin || null,
  };
}

function successPage(user: any): string {
  const safeUser = JSON.stringify(user).replace(/</g, "\\u003c");
  const display = String(user.githubLogin || user.name || user.email || "user").replace(/[<>&"']/g, "");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Authentication successful</title></head><body><p>Authenticated as <b>@${display}</b>. You can close this window.</p><script>const user=${safeUser};if(window.opener){window.opener.postMessage({type:"NEXUSS_AUTH_SUCCESS",provider:"github",user},window.location.origin);setTimeout(()=>window.close(),700)}else{window.location.href="/app"}</script></body></html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");
  const handoffToken = typeof req.query.handoff_token === "string" ? req.query.handoff_token : typeof req.query.handoffToken === "string" ? req.query.handoffToken : "";
  if (!handoffToken) return res.status(400).send("Missing Nexuss Auth handoff token.");
  const authUrl = (process.env.NEXUSS_AUTH_URL || process.env.VITE_NEXUSS_AUTH_URL || "https://nexuss-auth.vercel.app").replace(/\/+$/, "");
  const projectId = process.env.NEXUSS_AUTH_PROJECT_ID || process.env.VITE_NEXUSS_AUTH_PROJECT_ID || "ethco-agents";
  try {
    const response = await fetch(`${authUrl}/v1/handoff/exchange`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ projectId, handoffToken }) });
    const raw: any = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(401).send(`Nexuss Auth handoff failed: ${raw.error || "invalid handoff"}`);
    const user = userFrom(raw);
    const githubGrantToken = raw.githubGrantToken || raw.data?.githubGrantToken;
    const cookies = [`session_token=${encodeURIComponent(jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET || "YOUR_RANDOM_SECRET_KEY", { expiresIn: "7d" }))}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`];
    if (typeof githubGrantToken === "string" && githubGrantToken.trim()) {
      saveGrant(req, githubGrantToken, { id: user.id, login: user.githubLogin || user.name, name: user.name, avatar_url: user.avatarUrl || "" });
      cookies.push(`github_grant_token=${encodeURIComponent(githubGrantToken)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
    }
    res.setHeader("Set-Cookie", cookies);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(successPage(user));
  } catch (error: any) {
    console.error("[Nexuss Auth] isolated handoff failed", error);
    return res.status(502).send(`Nexuss Auth handoff failed: ${error?.message || "upstream unavailable"}`);
  }
}
