import { pool } from "./db.js";
import { refund } from "./gateway.js";

type OutboxHandler = (payload: Record<string, unknown>) => Promise<void>;
const handlers = new Map<string, OutboxHandler>();

export function registerOutboxHandler(topic: string, handler: OutboxHandler) {
  handlers.set(topic, handler);
}

export function startOutboxWorker() {
  const poll = async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `SELECT * FROM outbox_events
         WHERE processed_at IS NULL AND available_at <= now()
         ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 10`,
      );
      for (const event of rows) {
        const handler = handlers.get(event.topic);
        if (!handler) {
          await client.query(
            `UPDATE outbox_events SET attempts = attempts + 1,
             last_error = 'No handler registered',
             available_at = now() + interval '5 minutes' WHERE id = $1`,
            [event.id],
          );
          continue;
        }
        try {
          await handler(event.payload as Record<string, unknown>);
          await client.query(
            "UPDATE outbox_events SET processed_at = now() WHERE id = $1",
            [event.id],
          );
        } catch (error) {
          await client.query(
            `UPDATE outbox_events SET attempts = attempts + 1, last_error = $2,
             available_at = now() + make_interval(secs => LEAST(300, power(2, attempts + 1))) WHERE id = $1`,
            [event.id, error instanceof Error ? error.message : String(error)],
          );
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.error("outbox worker error", error);
    } finally {
      client.release();
    }
  };
  registerOutboxHandler("payment.succeeded", async () => undefined);
  registerOutboxHandler("payment.refund_required", async (payload) => {
    if (
      typeof payload.chargeId !== "string" ||
      !(await refund(payload.chargeId))
    ) {
      throw new Error("Refund gateway call failed");
    }
    await pool.query(
      "UPDATE payments SET status = 'REFUNDED' WHERE id = $1 AND status = 'REFUND_REQUIRED'",
      [payload.paymentId],
    );
  });
  setInterval(() => void poll(), 250);
}
