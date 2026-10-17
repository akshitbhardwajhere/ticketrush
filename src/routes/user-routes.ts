import { Router } from "express";
import {
  createUserHandler,
  loginHandler,
  logoutHandler,
  logoutAllHandler,
} from "../controllers/user-controller.js";
import {
  authIpRateLimit,
  authEmailRateLimit,
} from "../middlewares/auth-rate-limit.js";
import { requireAuth } from "../middlewares/auth.js";

export const userRoutes = Router();

// Registration: rate-limit by IP and by email to prevent automated sign-ups
userRoutes.post(
  "/",
  authIpRateLimit,
  authEmailRateLimit,
  createUserHandler,
);

// Login: rate-limit by IP and by email to prevent brute-force / credential stuffing
userRoutes.post(
  "/login",
  authIpRateLimit,
  authEmailRateLimit,
  loginHandler,
);

// Logout current session (no auth required – we just revoke whatever token is presented)
userRoutes.post("/logout", logoutHandler);

// Logout all sessions (auth required so we know whose sessions to revoke)
userRoutes.post("/logout-all", requireAuth, logoutAllHandler);
