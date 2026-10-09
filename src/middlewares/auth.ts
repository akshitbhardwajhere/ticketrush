import type { RequestHandler } from "express";
import { authenticate } from "../services/auth-service.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; email: string };
    }
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.header("Authorization");
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ error: "Authentication required" });
  const user = await authenticate(header.slice(7));
  if (!user)
    return res.status(401).json({ error: "Invalid or expired session" });
  req.user = user;
  next();
};
