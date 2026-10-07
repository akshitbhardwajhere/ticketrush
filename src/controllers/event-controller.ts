import type { Request, Response } from "express";
import { z } from "zod";
import {
  createEvent,
  listEventSeats,
  listEvents,
} from "../services/event-service.js";

const createEventSchema = z.object({
  name: z.string().min(1),
  startsAt: z.string().datetime(),
  seats: z.number().int().min(1).max(10000),
});

export async function createEventHandler(req: Request, res: Response) {
  const input = createEventSchema.parse(req.body);
  res.status(201).json(await createEvent(input));
}

export async function listEventsHandler(_req: Request, res: Response) {
  res.json(await listEvents());
}

export async function listEventSeatsHandler(req: Request, res: Response) {
  const eventId = z.coerce.number().int().positive().parse(req.params.id);
  res.json(await listEventSeats(String(eventId)));
}
