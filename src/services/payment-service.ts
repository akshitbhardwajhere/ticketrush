import { createHash } from "crypto";
import type { Pool, PoolClient } from "pg";
import { pool } from "../db.js";
import { charge } from "../gateway.js";
import { getSeatForEvent, isValidHold } from "./seat-service.js";

type PaymentResponse = {
  status: number;
  body: unknown;
  retryAfter?: string;
  replayed?: boolean;
};

async function recordPayment(
  db: Pool | PoolClient,
  id: number,
  status: string,
  code: number,
  body: unknown,
) {
  await db.query(
    "UPDATE payments SET status=$1, response_code=$2, response_body=$3, updated_at=now() WHERE id=$4",
    [status, code, JSON.stringify(body), id],
  );
}

async function finalizeChargedPayment(payment: {
  id: number;
  eventId: number;
  seatId: number;
  userId: number;
  chargeId: string;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lockedSeat = await getSeatForEvent(
      client,
      payment.eventId,
      payment.seatId,
      true,
    );
    if (!isValidHold(lockedSeat, payment.userId)) {
      const body = {
        error: "Hold expired during payment. Refund will be issued.",
      };
      await client.query(
        `UPDATE payments
         SET status = 'REFUND_REQUIRED', response_code = 409,
             response_body = $2, updated_at = now()
         WHERE id = $1`,
        [payment.id, JSON.stringify(body)],
      );
      await client.query(
        `INSERT INTO outbox_events (topic, aggregate_id, payload)
         VALUES ('payment.refund_required', $1, $2)`,
        [
          String(payment.id),
          JSON.stringify({ paymentId: payment.id, chargeId: payment.chargeId }),
        ],
      );
      await client.query("COMMIT");
      return { status: 409, body };
    }
    await client.query(
      "UPDATE seats SET status = 'BOOKED', hold_expires_at = NULL WHERE id = $1",
      [payment.seatId],
    );
    const body = {
      seatId: payment.seatId,
      status: "BOOKED",
      chargeId: payment.chargeId,
    };
    await client.query(
      `INSERT INTO outbox_events (topic, aggregate_id, payload)
       VALUES ('payment.succeeded', $1, $2)`,
      [
        String(payment.id),
        JSON.stringify({
          paymentId: payment.id,
          userId: payment.userId,
          eventId: payment.eventId,
          seatId: payment.seatId,
          chargeId: payment.chargeId,
        }),
      ],
    );
    await recordPayment(client, payment.id, "SUCCEEDED", 200, body);
    await client.query("COMMIT");
    return { status: 200, body };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function processPayment(input: {
  key: string;
  eventId: number;
  seatId: number;
  userId: number;
  amountPaise: number;
  paymentMethodId?: string;
}): Promise<PaymentResponse> {
  const user = await pool.query("SELECT id FROM users WHERE id = $1", [
    input.userId,
  ]);
  if (user.rowCount === 0) {
    return { status: 404, body: { error: "User not found" } };
  }

  const seat = await getSeatForEvent(pool, input.eventId, input.seatId);
  if (!seat) {
    return { status: 404, body: { error: "Seat not found" } };
  }

  const requestHash = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
  const claim = await pool.query(
    `INSERT INTO payments
       (idempotency_key, user_id, seat_id, amount_paise, request_hash, payment_method_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [
      input.key,
      input.userId,
      input.seatId,
      input.amountPaise,
      requestHash,
      input.paymentMethodId ?? null,
    ],
  );

  if (claim.rowCount === 0) {
    const { rows } = await pool.query(
      "SELECT * FROM payments WHERE idempotency_key = $1",
      [input.key],
    );
    const payment = rows[0];
    if (payment.request_hash !== requestHash) {
      return {
        status: 422,
        body: { error: "Idempotency-Key reused with a different request" },
      };
    }
    if (payment.status === "PROCESSING") {
      return {
        status: 409,
        retryAfter: "1",
        body: { error: "Request in progress, retry shortly" },
      };
    }
    return {
      status: payment.response_code,
      replayed: true,
      body: payment.response_body,
    };
  }

  const paymentId = claim.rows[0].id as number;
  if (!isValidHold(seat, input.userId)) {
    const body = { error: "No valid hold for this user" };
    await recordPayment(pool, paymentId, "FAILED", 409, body);
    return { status: 409, body };
  }

  const result = await charge(
    input.key,
    input.amountPaise,
    input.paymentMethodId,
  );
  if (!result.ok) {
    const body = {
      error: "Payment was not completed",
      reason: result.error ?? "Payment declined",
      ...(result.status ? { paymentStatus: result.status } : {}),
    };
    await recordPayment(pool, paymentId, "FAILED", 402, body);
    return { status: 402, body };
  }

  return finalizeChargedPayment({
    id: paymentId,
    eventId: input.eventId,
    seatId: input.seatId,
    userId: input.userId,
    chargeId: result.chargeId!,
  });
}

export function startPaymentReconciliation() {
  const reconcile = async () => {
    const { rows } = await pool.query(
      `SELECT p.*, s.event_id AS event_id
       FROM payments p
       JOIN seats s ON s.id = p.seat_id
       WHERE p.status = 'PROCESSING'
         AND p.updated_at < now() - interval '5 minutes'
       ORDER BY p.updated_at
       FOR UPDATE OF p SKIP LOCKED
       LIMIT 10`,
    );
    for (const payment of rows) {
      await pool.query(
        "UPDATE payments SET updated_at = now() WHERE id = $1 AND status = 'PROCESSING'",
        [payment.id],
      );
      const result = await charge(
        payment.idempotency_key,
        payment.amount_paise,
        payment.payment_method_id ?? undefined,
      );
      if (!result.ok) {
        await recordPayment(pool, payment.id, "FAILED", 402, {
          error: "Payment was not completed",
          reason: result.error ?? "Payment declined",
          ...(result.status ? { paymentStatus: result.status } : {}),
        });
        continue;
      }
      await finalizeChargedPayment({
        id: payment.id,
        eventId: payment.event_id,
        seatId: payment.seat_id,
        userId: payment.user_id,
        chargeId: result.chargeId!,
      });
    }
  };
  setInterval(
    () =>
      void reconcile().catch((error) => {
        console.error("payment reconciliation error", error);
      }),
    30_000,
  );
}
