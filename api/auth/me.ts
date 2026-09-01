import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt from "jsonwebtoken";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cookies = req.headers.cookie;
  if (!cookies) return res.json({ user: null });

  const match = cookies.match(/session_token=([^;]+)/);
  const token = match ? match[1] : null;
  if (!token) return res.json({ user: null });

  try {
    const secret = process.env.JWT_SECRET || "YOUR_RANDOM_SECRET_KEY";
    const user = jwt.verify(token, secret);
    res.json({ user });
  } catch (err) {
    res.json({ user: null });
  }
}
