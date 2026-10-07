import type { PoolClient } from "pg";
import { pool } from "../db.js";
import { config } from "../config.js";

export type SeatRecord = {
  id: number;
  status: string;
  held_by: number | null;
  hold_expires_at: Date | string | null;
};

export async function holdSeat(
  userId: number,
  eventId: number,
  seatId: number,
) {
  const user = await pool.query("SELECT id FROM users WHERE id = $1", [userId]);
  if (user.rowCount === 0) return null;

  const { rows } = await pool.query(
    `UPDATE seats
        SET status = 'HELD',
            held_by = $1,
            hold_expires_at = now() + make_interval(mins => $2)
      WHERE id = $3
        AND event_id = $4
        AND (status = 'AVAILABLE'
             OR (status = 'HELD' AND hold_expires_at < now()))
      RETURNING id, label, status, hold_expires_at`,
    [userId, config.holdMinutes, seatId, eventId],
  );
  return rows[0];
}

export async function getSeatForEvent(
  client: typeof pool | PoolClient,
  eventId: number,
  seatId: number,
  lock = false,
) {
  const lockClause = lock ? " FOR UPDATE" : "";
  const { rows } = await client.query<SeatRecord>(
    `SELECT * FROM seats WHERE id = $1 AND event_id = $2${lockClause}`,
    [seatId, eventId],
  );
  return rows[0];
}

export function isValidHold(seat: SeatRecord | undefined, userId: number) {
  return Boolean(
    seat &&
    seat.status === "HELD" &&
    seat.held_by === userId &&
    seat.hold_expires_at &&
    new Date(seat.hold_expires_at) > new Date(),
  );
}
