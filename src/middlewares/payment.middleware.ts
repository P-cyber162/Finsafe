import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.middleware.js";
import { prisma } from "../config/prisma.js";
import { AppError } from "../utils/AppError.js";
import type { ProcessPaymentInput } from "../schema/payment.schema.js";

const getIdempotencyKey = (headers: import("http").IncomingHttpHeaders): string | undefined => {
  const header = headers["Idempotency-Key"];
  if (Array.isArray(header)) return header[0];
  return header;
};

export const idempotencyCheck = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const user = req.user;
  const payload: ProcessPaymentInput = req.body;

  if (!user) {
    throw new AppError("Unauthorized user", 401, "UNAUTHORIZED");
  }

  const idempotencyKey = getIdempotencyKey(req.headers);

  if (!idempotencyKey) {
    return res.status(400).json({
      status: "error",
      code: "MISSING_KEY",
      message: "Idempotency key must br provided in the request header!",
    });
  }

  // User Story 2: The Duplicate Attempt (Idempotency Logic)
  const existingPayment = await prisma.payment.findUnique({
    where: {
      email_idempotencyKey: {
        email: user.email,
        idempotencyKey,
      },
    },
  });

  if (existingPayment) {
    res.set("X-Cache-Hit", "true");
    return res.status(201).json({
      status: "success",
      message: `Charged ${existingPayment.amount} ${existingPayment.currency}`,
    });
  }

  // User Story 3: Different Request, Same Key (Fraud/Error Check)
  const keyOwner = await prisma.payment.findUnique({
    where: {
      idempotencyKey,
    },
  });

  if (
    keyOwner &&
    (keyOwner.amount !== payload.amount ||
      keyOwner.currency !== payload.currency)
  ) {
    return res.status(409).json({
      status: "fail",
      message: "Idempotency key already used for a different request body!",
    });
  }

  next();
};

// Task: Identify one additional feature or safety mechanism
// that would make this system better for a real-world Fintech company.

/*Answer:
A check system middlware that checks the user's balance before performing any transaction 
to avoid processing a payment the user may not have enough funds for with a fail status and 'You do not have enough funds to perform this transaction!' message returned!
*/

// User story bonus: Balance middleware check
export const balanceCheck = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const user = req.user;
  const payload: ProcessPaymentInput = req.body;

  if (!user) {
    throw new AppError("Unauthorized user", 401, "UNAUTHORIZED");
  }

  const balance = await prisma.user.findUnique({
    where: {
      id: user.id,
    },
    select: {
      balance: true,
    },
  });

  if (!balance || payload.amount >= balance.balance) {
    return res.status(400).json({
      status: "fail",
      message: "You do not have enough funds to perform this transaction!",
    });
  }

  next();
};
