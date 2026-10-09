import { pool } from "../db.js";
import { register } from "./auth-service.js";

export async function createUser(email: string, password: string) {
  return register(email, password);
}
