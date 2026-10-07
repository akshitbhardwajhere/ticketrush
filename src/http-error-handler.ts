import type { ErrorRequestHandler } from "express";
import { z } from "zod";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ errors: error.issues });
  }

  console.error(error);
  return res.status(500).json({ error: "Internal server error" });
};
