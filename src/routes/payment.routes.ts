import { Router, type RequestHandler } from "express";
import { validateBody } from "../middlewares/validation.middleware.js";
import { processPaymentSchema } from "../schema/payment.schema.js";
import { processPayment } from "../controllers/payment.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import {
  balanceCheck,
  idempotencyCheck,
} from "../middlewares/payment.middleware.js";

const router = Router();

router.post(
  "/process-payment",
  authenticateToken as RequestHandler,
  validateBody(processPaymentSchema),
  idempotencyCheck as RequestHandler,
  balanceCheck as RequestHandler,
  processPayment,
);

export default router;
