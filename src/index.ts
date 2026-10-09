import express from "express";
import { errorHandler } from "./http-error-handler.js";
import { queueRouter } from "./queue.js";
import { eventRoutes } from "./routes/event-routes.js";
import { userRoutes } from "./routes/user-routes.js";
import { metricsMiddleware, metricsText } from "./metrics.js";

export const app = express();
app.use(express.json());
app.use(metricsMiddleware);
app.get("/health", (_req, res) =>
  res.json({ status: "ok", instance: process.env.INSTANCE_ID ?? "local" }),
);
app.get("/metrics", (_req, res) => res.type("text/plain").send(metricsText()));
app.use("/users", userRoutes);
app.use("/events", eventRoutes);
app.use(queueRouter);

// Error handler (zod validation errors -> 400)
app.use(errorHandler);
