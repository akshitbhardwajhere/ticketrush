import express from "express";
import { errorHandler } from "./http-error-handler.js";
import { queueRouter } from "./queue.js";
import { eventRoutes } from "./routes/event-routes.js";
import { userRoutes } from "./routes/user-routes.js";

export const app = express();
app.use(express.json());
app.use("/users", userRoutes);
app.use("/events", eventRoutes);
app.use(queueRouter);

// Error handler (zod validation errors -> 400)
app.use(errorHandler);
