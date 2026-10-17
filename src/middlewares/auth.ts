import type { RequestHandler } from "express";
import { authenticate } from "../services/auth-service.js";
import { resolveToken } from "../controllers/user-controller.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; email: string };
    }
  }
}

/**
 * Middleware that validates a session and attaches `req.user`.
 *
 * Token resolution order:
 *   1. Authorization: Bearer <token>  (API clients)
 *   2. session cookie                 (browser clients)
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = resolveToken(req);
  if (!token)
    return res.status(401).json({ error: "Authentication required" });

  const user = await authenticate(token);
  if (!user)
    return res.status(401).json({ error: "Invalid or expired session" });

  req.user = user;
  next();
};
