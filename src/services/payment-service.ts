import { createHash } from "crypto";
import type { Pool, PoolClient } from "pg";
import { pool } from "../db.js";
import { charge } from "../gateway.js";
import { getSeatForEvent, isValidHold } from "./seat-service.js";

async function recordPayment(
  db: Pool | PoolClient,
  id: number,
  status: string,
  code: number,
  body: unknown,
) {
  await db.query(
    "UPDATE payments SET status=$1, response_code=$2, response_body=$3 WHERE id=$4",
    [status, code, JSON.stringify(body), id],
  );
}

export async function processPayment(input: {
  key: string;
  eventId: number;
  seatId: number;
  userId: number;
  amountPaise: number;
  paymentMethodId?: string;
}) {
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
    `INSERT INTO payments (idempotency_key, user_id, seat_id, amount_paise, request_hash)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [input.key, input.userId, input.seatId, input.amountPaise, requestHash],
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lockedSeat = await getSeatForEvent(
      client,
      input.eventId,
      input.seatId,
      true,
    );
    if (!isValidHold(lockedSeat, input.userId)) {
      await client.query("ROLLBACK");
      const body = {
        error: "Hold expired during payment. Refund will be issued.",
      };
      await recordPayment(pool, paymentId, "REFUND_REQUIRED", 409, body);
      await pool.query(
        `INSERT INTO outbox_events (topic, aggregate_id, payload)
         VALUES ('payment.refund_required', $1, $2)`,
        [
          String(paymentId),
          JSON.stringify({ paymentId, chargeId: result.chargeId }),
        ],
      );
      return { status: 409, body };
    }
    await client.query(
      "UPDATE seats SET status = 'BOOKED', hold_expires_at = NULL WHERE id = $1",
      [input.seatId],
    );
    const body = {
      seatId: input.seatId,
      status: "BOOKED",
      chargeId: result.chargeId,
    };
    await client.query(
      `INSERT INTO outbox_events (topic, aggregate_id, payload)
       VALUES ('payment.succeeded', $1, $2)`,
      [
        String(paymentId),
        JSON.stringify({
          paymentId,
          userId: input.userId,
          eventId: input.eventId,
          seatId: input.seatId,
          chargeId: result.chargeId,
        }),
      ],
    );
    await recordPayment(client, paymentId, "SUCCEEDED", 200, body);
    await client.query("COMMIT");
    return { status: 200, body };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
