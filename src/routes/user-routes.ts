import { Router } from "express";
import { createUserHandler } from "../controllers/user-controller.js";

export const userRoutes = Router();
userRoutes.post("/", createUserHandler);
