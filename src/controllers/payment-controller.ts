import type { Request, Response } from "express";
import { z } from "zod";
import { processPayment } from "../services/payment-service.js";

const paymentBodySchema = z.object({
  amountPaise: z.number().int().positive(),
  paymentMethodId: z.string().optional(),
});

export async function payForSeatHandler(req: Request, res: Response) {
  const key = req.header("Idempotency-Key");
  if (!key)
    return res.status(400).json({ error: "Idempotency-Key header required" });

  const body = paymentBodySchema.parse(req.body);
  if (process.env.STRIPE_SECRET_KEY && !body.paymentMethodId) {
    return res
      .status(400)
      .json({ error: "paymentMethodId is required for Stripe payments" });
  }
  const eventId = z.coerce.number().int().positive().parse(req.params.eventId);
  const seatId = z.coerce.number().int().positive().parse(req.params.seatId);
  const result = await processPayment({
    key,
    eventId,
    seatId,
    userId: req.user!.id,
    amountPaise: body.amountPaise,
    ...(body.paymentMethodId ? { paymentMethodId: body.paymentMethodId } : {}),
  });

  if (result.retryAfter) res.set("Retry-After", result.retryAfter);
  if (result.replayed) res.set("Idempotent-Replayed", "true");
  return res.status(result.status).json(result.body);
}
