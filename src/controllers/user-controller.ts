import type { Request, Response } from "express";
import { z } from "zod";
import { createUser } from "../services/user-service.js";

const createUserSchema = z.object({ email: z.string().email() });

export async function createUserHandler(req: Request, res: Response) {
  const { email } = createUserSchema.parse(req.body);
  res.status(201).json(await createUser(email));
}
