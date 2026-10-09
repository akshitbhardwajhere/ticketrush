import type { Request, Response } from "express";
import { z } from "zod";
import { login, register } from "../services/auth-service.js";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
});

export async function createUserHandler(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);
  const user = await register(email, password);
  if (!user)
    return res.status(409).json({ error: "Email is already registered" });
  return res.status(201).json(user);
}

export async function loginHandler(req: Request, res: Response) {
  const { email, password } = credentialsSchema.parse(req.body);
  const result = await login(email, password);
  if (!result) return res.status(401).json({ error: "Invalid credentials" });
  return res.json(result);
}
