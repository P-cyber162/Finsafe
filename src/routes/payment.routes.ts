import { Router, type RequestHandler } from "express";
import { validateBody } from "../middlewares/validation.middleware";
import { processPaymentSchema } from "../schema/payment.schema";
import { processPayment } from "../controllers/payment.controller";
import { authenticateToken } from "../middlewares/auth.middleware";
import {
  balanceCheck,
  idempotencyCheck,
} from "../middlewares/payment.middleware";

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
