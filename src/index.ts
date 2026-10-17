import express from "express";
import cookieParser from "cookie-parser";
import { errorHandler } from "./http-error-handler.js";
import { queueRouter } from "./queue.js";
import { eventRoutes } from "./routes/event-routes.js";
import { userRoutes } from "./routes/user-routes.js";
import { metricsMiddleware, metricsText } from "./metrics.js";
import { config } from "./config.js";

export const app = express();

// Parse JSON bodies
app.use(express.json());

// Parse signed cookies – the secret prevents tampering of cookie values.
// Even if not using signed cookies today, the secret future-proofs the setup.
app.use(cookieParser(config.cookieSecret));

// Trust the first proxy so req.ip reflects the real client IP behind HAProxy / nginx
app.set("trust proxy", 1);

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
