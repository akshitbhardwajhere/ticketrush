import type { Request, Response } from "express";
import { z } from "zod";
import {
  login,
  logout,
  logoutAll,
  register,
  PASSWORD_MAX,
} from "../services/auth-service.js";
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const credentialsSchema = z.object({
  email: z.string().email(),
  // min 12 chars, max PASSWORD_MAX to prevent excessive scrypt work (DoS)
  password: z.string().min(12).max(PASSWORD_MAX),
});

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

const COOKIE_NAME = "session";

function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
    path: "/",
  });
}

function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

/** Resolve token from Authorization header (Bearer …) or the session cookie. */
export function resolveToken(req: Request): string | null {
  const header = req.header("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookie: string | undefined = req.cookies?.[COOKIE_NAME];
  return cookie ?? null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function createUserHandler(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);
  const user = await register(email, password);
  if (!user)
    return res.status(409).json({ error: "Email is already registered" });
  return res.status(201).json(user);
}

export async function loginHandler(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);
  const result = await login(email, password);
  if (!result) return res.status(401).json({ error: "Invalid credentials" });

  // Issue both a cookie and return the token in the body so that API clients
  // (mobile apps, curl, etc.) and browser clients are both served.
  setSessionCookie(res, result.token);
  return res.json(result);
}

/**
 * POST /users/logout
 * Revokes the current session (current device / client).
 * Accepts the token from the Authorization header or the session cookie.
 */
export async function logoutHandler(req: Request, res: Response) {
  const token = resolveToken(req);
  if (token) await logout(token);
  clearSessionCookie(res);
  return res.json({ message: "Logged out" });
}

/**
 * POST /users/logout-all
 * Revokes every active session for the authenticated user (all devices).
 * Requires a valid session (enforced via requireAuth middleware in the router).
 */
export async function logoutAllHandler(req: Request, res: Response) {
  const revoked = await logoutAll(req.user!.id);
  clearSessionCookie(res);
  return res.json({ message: "All sessions revoked", count: revoked });
}
