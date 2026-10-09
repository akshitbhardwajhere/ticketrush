import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  holdMinutes: 10,
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://postgres:pass@localhost:5441/ticketrush",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6331",
  paymentGateway: process.env.PAYMENT_GATEWAY ?? "mock",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  paymentCurrency: process.env.PAYMENT_CURRENCY ?? "inr",
};
