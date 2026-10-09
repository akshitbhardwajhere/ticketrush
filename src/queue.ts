import express from "express";
import { z } from "zod";
import { redis } from "./redis.js";
import { pool } from "./db.js";
import { requireAuth } from "./middlewares/auth.js";

export const queueRouter = express.Router();

const queueKey = (eventId: string) => `queue:${eventId}`;
const passKey = (eventId: string, userId: number | string) =>
  `admitted:${eventId}:${userId}`;
const PASS_TTL_SEC = Number(process.env.PASS_TTL_SEC ?? 120);
const ADMIT_PER_TICK = Number(process.env.ADMIT_PER_TICK ?? 20);

// Queue mein judo
queueRouter.post(
  "/events/:eventId/queue/join",
  requireAuth,
  async (req, res) => {
    const userId = req.user!.id;
    const eventId = z.coerce
      .number()
      .int()
      .positive()
      .parse(req.params.eventId);
    const exists = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)
       AND EXISTS (SELECT 1 FROM events WHERE id = $2) AS valid`,
      [userId, eventId],
    );
    if (!exists.rows[0]?.valid) {
      return res.status(404).json({ error: "User or event not found" });
    }

    const eventKey = String(eventId);
    const ttl = await redis.ttl(passKey(eventKey, userId));
    if (ttl > 0) return res.json({ status: "ADMITTED", expiresInSec: ttl });

    // NX: dobara join karne par apni purani jagah nahi khoyega
    await redis.zadd(queueKey(eventKey), "NX", Date.now(), String(userId));
    await redis.sadd("queues", eventKey);
    const rank = await redis.zrank(queueKey(eventKey), String(userId));
    res.json({ status: "WAITING", position: (rank ?? 0) + 1 });
  },
);

// Apni position / admission check karo
queueRouter.get(
  "/events/:eventId/queue/status",
  requireAuth,
  async (req, res) => {
    const userId = req.user!.id;
    const eventId = z.coerce
      .number()
      .int()
      .positive()
      .parse(req.params.eventId);
    const eventKey = String(eventId);

    const ttl = await redis.ttl(passKey(eventKey, userId));
    if (ttl > 0) return res.json({ status: "ADMITTED", expiresInSec: ttl });

    const rank = await redis.zrank(queueKey(eventKey), String(userId));
    if (rank !== null)
      return res.json({ status: "WAITING", position: rank + 1 });
    res.json({ status: "NOT_IN_QUEUE" });
  },
);

// Har second queue ke aage se N log andar bhejo
export function startAdmitter() {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      for (const eventId of await redis.smembers("queues")) {
        // ZPOPMIN atomic hai, to kai server instances chalein tab bhi koi do baar admit nahi hoga
        const popped = await redis.zpopmin(queueKey(eventId), ADMIT_PER_TICK);
        for (let i = 0; i < popped.length; i += 2) {
          const userId = popped[i];
          if (userId === undefined) continue;
          await redis.set(passKey(eventId, userId), "1", "EX", PASS_TTL_SEC);
        }
        if ((await redis.zcard(queueKey(eventId))) === 0) {
          await redis.srem("queues", eventId);
        }
      }
    } catch (e) {
      console.error("admitter error", e);
    } finally {
      running = false;
    }
  }, 1000);
}

// Hold route ke aage lagega. Sirf QUEUE_GATE=on par active hota hai.
export const requireAdmission: express.RequestHandler = async (
  req,
  res,
  next,
) => {
  if (process.env.QUEUE_GATE !== "on") return next();
  const eventId = z.coerce.number().int().positive().parse(req.params.eventId);
  const userId = req.user!.id;
  const ok = await redis.exists(passKey(String(eventId), userId));
  if (!ok) return res.status(403).json({ error: "Join the queue first" });
  next();
};
