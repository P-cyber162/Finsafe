import { Router } from "express";
import { validateBody } from "../middlewares/validation.middleware.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { loginSchema, registerSchema } from "../schema/auth.schema.js";
import {
  loginUser,
  logoutUser,
  refreshToken,
  registerUser,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/register", validateBody(registerSchema), registerUser);

router.post("/login", validateBody(loginSchema), loginUser);

router.post("/refresh", refreshToken);

router.get("/logout", authenticateToken, logoutUser);

export default router;
