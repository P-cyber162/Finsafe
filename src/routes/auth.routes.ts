import { Router } from "express";
import { validateBody } from "../middlewares/validation.middleware";
import { loginSchema, registerSchema } from "../schema/auth.schema";
import {
  loginUser,
  logoutUser,
  registerUser,
} from "../controllers/auth.controller";

const router = Router();

router.post("/register", validateBody(registerSchema), registerUser);

router.post("/login", validateBody(loginSchema), loginUser);

router.get("/logout", logoutUser);

export default router;
