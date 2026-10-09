import { Router } from "express";
import {
  createUserHandler,
  loginHandler,
} from "../controllers/user-controller.js";

export const userRoutes = Router();
userRoutes.post("/", createUserHandler);
userRoutes.post("/login", loginHandler);
