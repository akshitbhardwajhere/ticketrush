import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 3000),
  holdMinutes: 10,
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://postgres:pass@localhost:5441/ticketrush",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6331",
};
