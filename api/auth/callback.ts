import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");
  const handoffToken = typeof req.query.handoff_token === "string" ? req.query.handoff_token : typeof req.query.handoffToken === "string" ? req.query.handoffToken : "";
  if (!handoffToken) return res.status(400).send("Missing Nexuss Auth handoff token.");
  // Keep the registered Nexuss Auth callback stable while isolating all handoff
  // exchange, cookies, and GitHub grant persistence in its own function.
  return res.redirect(302, `/api/auth/handoff?handoff_token=${encodeURIComponent(handoffToken)}`);
}
