import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  holdMinutes: 10,
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://postgres:pass@localhost:5441/ticketrush",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6331",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  paymentCurrency: process.env.PAYMENT_CURRENCY ?? "inr",
  /**
   * Whether session cookies should be marked Secure (HTTPS-only).
   * Set COOKIE_SECURE=false only in local development without HTTPS.
   */
  cookieSecure: process.env.COOKIE_SECURE !== "false",
  /**
   * Secret used to sign cookies. Must be set in production.
   * Falls back to a hard-coded dev-only value so the server still starts locally.
   */
  cookieSecret:
    process.env.COOKIE_SECRET ?? "dev-only-change-me-in-production",
};
