import type { Request, Response } from "express";
import { z } from "zod";
import { holdSeat } from "../services/seat-service.js";

export async function holdSeatHandler(req: Request, res: Response) {
  const userId = req.user!.id;
  const eventId = z.coerce.number().int().positive().parse(req.params.eventId);
  const seatId = z.coerce.number().int().positive().parse(req.params.seatId);
  const seat = await holdSeat(userId, eventId, seatId);
  if (seat === null) return res.status(404).json({ error: "User not found" });
  if (!seat) return res.status(409).json({ error: "Seat is not available" });
  return res.status(201).json(seat);
}
