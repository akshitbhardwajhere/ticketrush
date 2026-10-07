import { pool } from "../db.js";

export async function createEvent(input: {
  name: string;
  startsAt: string;
  seats: number;
}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO events (name, starts_at) VALUES ($1, $2) RETURNING *",
      [input.name, input.startsAt],
    );
    await client.query(
      `INSERT INTO seats (event_id, label)
       SELECT $1, 'S' || g FROM generate_series(1, $2::int) g`,
      [rows[0].id, input.seats],
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listEvents() {
  const { rows } = await pool.query("SELECT * FROM events ORDER BY starts_at");
  return rows;
}

export async function listEventSeats(eventId: string) {
  const { rows } = await pool.query(
    "SELECT id, label, status FROM seats WHERE event_id = $1 ORDER BY id",
    [eventId],
  );
  return rows;
}
