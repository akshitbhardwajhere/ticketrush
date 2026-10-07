import { pool } from "../db.js";

export async function createUser(email: string) {
  const { rows } = await pool.query(
    `INSERT INTO users (email) VALUES ($1)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING *`,
    [email],
  );
  return rows[0];
}
