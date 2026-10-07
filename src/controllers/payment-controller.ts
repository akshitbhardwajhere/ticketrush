import type { Request, Response } from "express";
import { z } from "zod";
import { processPayment } from "../services/payment-service.js";

const paymentBodySchema = z.object({
  userId: z.number().int(),
  amountPaise: z.number().int().positive(),
});

export async function payForSeatHandler(req: Request, res: Response) {
  const key = req.header("Idempotency-Key");
  if (!key)
    return res.status(400).json({ error: "Idempotency-Key header required" });

  const body = paymentBodySchema.parse(req.body);
  const eventId = z.coerce.number().int().positive().parse(req.params.eventId);
  const seatId = z.coerce.number().int().positive().parse(req.params.seatId);
  const result = await processPayment({
    key,
    eventId,
    seatId,
    ...body,
  });

  if (result.retryAfter) res.set("Retry-After", result.retryAfter);
  if (result.replayed) res.set("Idempotent-Replayed", "true");
  return res.status(result.status).json(result.body);
}
