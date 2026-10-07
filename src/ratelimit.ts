import type { Request, RequestHandler } from "express";
import { redis } from "./redis.js";

const TOKEN_BUCKET = `
local capacity = tonumber(ARGV[1])
local refill   = tonumber(ARGV[2])
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)

local data   = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts     = tonumber(data[2])
if tokens == nil then tokens = capacity; ts = now end

tokens = math.min(capacity, tokens + (math.max(0, now - ts) / 1000) * refill)
local allowed = 0
if tokens >= 1 then tokens = tokens - 1; allowed = 1 end

redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(capacity / refill * 2000))
return { allowed, math.floor(tokens) }
`;

export function rateLimit(opts: {
  name: string;
  capacity: number; // burst size
  refillPerSec: number; // steady rate
  keyFn: (req: Request) => string;
}): RequestHandler {
  return async (req, res, next) => {
    try {
      const key = `rl:${opts.name}:${opts.keyFn(req)}`;
      const [allowed, remaining] = (await redis.eval(
        TOKEN_BUCKET,
        1,
        key,
        opts.capacity,
        opts.refillPerSec,
      )) as [number, number];

      res.set("X-RateLimit-Remaining", String(remaining));
      if (!allowed) {
        res.set("Retry-After", String(Math.ceil(1 / opts.refillPerSec)));
        return res.status(429).json({ error: "Too many requests" });
      }
      next();
    } catch (e) {
      console.error("rate limiter down, failing open", e);
      next(); // Redis down hai to bhi booking chalne do
    }
  };
}
