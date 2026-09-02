import type { VercelRequest, VercelResponse } from "@vercel/node";
import { saveGrant } from "./_grant";

async function exchangeHandoff(handoffToken: string): Promise<{ user: any; githubGrantToken: string }> {
  const authUrl = (process.env.NEXUSS_AUTH_URL || process.env.VITE_NEXUSS_AUTH_URL || "https://nexuss-auth.vercel.app").replace(/\/+$/, "");
  const projectId = process.env.NEXUSS_AUTH_PROJECT_ID || process.env.VITE_NEXUSS_AUTH_PROJECT_ID || "ethco-agents";
  const response = await fetch(`${authUrl}/v1/handoff/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ projectId, handoffToken }),
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Nexuss Auth handoff exchange failed");
  const githubGrantToken = body.githubGrantToken;
  if (!body.user?.id || !githubGrantToken) throw new Error("Nexuss Auth did not return a GitHub authorization grant");
  return { user: body.user, githubGrantToken };
}

function safeUser(user: any) {
  return {
    id: user.id,
    login: user.login || user.name || "user",
    name: user.name || user.login || "GitHub User",
    avatar_url: user.avatar_url || user.avatarUrl || "",
    html_url: user.html_url || user.htmlUrl || "",
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");
  const handoffToken = typeof req.query.handoff_token === "string" ? req.query.handoff_token : typeof req.query.handoffToken === "string" ? req.query.handoffToken : "";
  if (!handoffToken) return res.status(400).send("Missing Nexuss Auth handoff token.");
  try {
    const handoff = await exchangeHandoff(handoffToken);
    const user = safeUser(handoff.user);
    saveGrant(req, handoff.githubGrantToken, user);
    const serialized = JSON.stringify(user).replace(/</g, "\\u003c");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`<!doctype html><html><body><p>GitHub authorized as <b>@${String(user.login).replace(/[<>&"']/g, "")}</b>.</p><script>const user=${serialized};if(window.opener){window.opener.postMessage({type:"NEXUSS_AUTH_SUCCESS",provider:"github",user},window.location.origin);setTimeout(()=>window.close(),700)}else{window.location.href="/app"}</script></body></html>`);
  } catch (error: any) {
    console.error("[Nexuss Auth] GitHub handoff failed", error);
    return res.status(502).send(`GitHub authorization failed: ${error?.message || "handoff exchange failed"}`);
  }
}
