import { Router } from "express";
import {
  createEventHandler,
  listEventSeatsHandler,
  listEventsHandler,
} from "../controllers/event-controller.js";
import { holdRateLimit } from "../middlewares/hold-rate-limit.js";
import { requireAdmission } from "../queue.js";
import { holdSeatHandler } from "../controllers/seat-controller.js";
import { payForSeatHandler } from "../controllers/payment-controller.js";

export const eventRoutes = Router();

eventRoutes.post("/", createEventHandler);
eventRoutes.get("/", listEventsHandler);
eventRoutes.get("/:id/seats", listEventSeatsHandler);
eventRoutes.post(
  "/:eventId/seats/:seatId/hold",
  holdRateLimit,
  requireAdmission,
  holdSeatHandler,
);
eventRoutes.post("/:eventId/seats/:seatId/pay", payForSeatHandler);
