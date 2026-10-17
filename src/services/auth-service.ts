import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { pool } from "../db.js";

const scrypt = promisify(scryptCallback);
const SESSION_DAYS = 30;

/** Maximum password length accepted. Prevents DoS via excessive scrypt work. */
export const PASSWORD_MAX = 128;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [salt, encoded] = stored.split(":");
  if (!salt || !encoded) return false;
  const expected = Buffer.from(encoded, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Normalise an email address: trim surrounding whitespace and lower-case.
 * This ensures User@Example.com and user@example.com resolve to the same account.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function register(email: string, password: string) {
  const normEmail = normaliseEmail(email);
  const passwordHash = await hashPassword(password);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    [normEmail, passwordHash],
  );
  return rows[0] ?? null;
}

export async function login(email: string, password: string) {
  const normEmail = normaliseEmail(email);
  const { rows } = await pool.query(
    "SELECT id, email, password_hash FROM users WHERE email = $1",
    [normEmail],
  );
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash)))
    return null;

  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
    [hashToken(token), user.id],
  );
  return { token, user: { id: user.id, email: user.email } };
}

/**
 * Validate a session token.
 * Returns the associated user or null when the token is missing, expired, or
 * has been revoked (revoked_at IS NOT NULL).
 */
export async function authenticate(token: string) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.expires_at > now()
       AND s.revoked_at IS NULL`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

/**
 * Revoke a single session (logout from current device).
 * Returns true when a session was actually revoked.
 */
export async function logout(token: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE sessions
     SET revoked_at = now()
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
    [hashToken(token)],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Revoke ALL active sessions belonging to a user (logout everywhere).
 * Useful after a password change or explicit "log out of all devices" action.
 */
export async function logoutAll(userId: number): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE sessions
     SET revoked_at = now()
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
    [userId],
  );
  return rowCount ?? 0;
}

// ---------------------------------------------------------------------------
// Internals (test helpers)
// ---------------------------------------------------------------------------

export const authInternals = {
  hashPassword,
  verifyPassword,
  hashToken,
  normaliseEmail,
  SESSION_DAYS,
  PASSWORD_MAX,
};
