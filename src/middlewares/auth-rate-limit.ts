/**
 * Redis-backed token-bucket rate limiters for authentication endpoints.
 *
 * Two independent buckets are applied to every login / register request:
 *   1. per-IP  – prevents distributed brute-force / credential-stuffing
 *   2. per-email – prevents targeted account attacks regardless of source IP
 *
 * Limits (tunable via environment variables):
 *   IP:    10 attempts burst, 1 per 10 s steady  (AUTH_IP_CAPACITY / AUTH_IP_REFILL)
 *   email: 5  attempts burst, 1 per 30 s steady  (AUTH_EMAIL_CAPACITY / AUTH_EMAIL_REFILL)
 */

import type { Request, RequestHandler } from "express";
import { rateLimit } from "../ratelimit.js";

const IP_CAPACITY = Number(process.env.AUTH_IP_CAPACITY ?? 10);
const IP_REFILL = Number(process.env.AUTH_IP_REFILL ?? 0.1); // 1 per 10 s

const EMAIL_CAPACITY = Number(process.env.AUTH_EMAIL_CAPACITY ?? 5);
const EMAIL_REFILL = Number(process.env.AUTH_EMAIL_REFILL ?? 0.033); // ~1 per 30 s

/** Extracts and normalises the email from the request body (same as the controller). */
function emailKey(req: Request): string {
  const raw: unknown = req.body?.email;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "unknown";
}

export const authIpRateLimit: RequestHandler = rateLimit({
  name: "auth:ip",
  capacity: IP_CAPACITY,
  refillPerSec: IP_REFILL,
  keyFn: (req) => req.ip ?? "unknown",
});

export const authEmailRateLimit: RequestHandler = rateLimit({
  name: "auth:email",
  capacity: EMAIL_CAPACITY,
  refillPerSec: EMAIL_REFILL,
  keyFn: emailKey,
});
