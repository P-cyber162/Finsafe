import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.middleware";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";

interface Payload {
  amount: number;
  currency: string;
}

export const idempotencyCheck = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const user = req.user;
  const payload: Payload = req.body;

  if (!user) {
    throw new AppError("Unauthorized user", 401, "UNAUTHORIZED");
  }

  const idempotencyKey = req.headers["Idempotency-Key"];

  if (!idempotencyKey) {
    return res.status(400).json({
      status: "error",
      code: "MISSING_KEY",
      message: "Idempotency key must br provided in the request header!",
    });
  }

  // User Story 2: The Duplicate Attempt (Idempotency Logic)
  let payment;

  payment = await prisma.payment.findUnique({
    where: {
      email: user.email,
      idempotencyKey: idempotencyKey,
      amount: payload?.amount,
      currency: payload?.currency,
    },
  });

  if (payment) {
    res.set("X-Cache-Hit", "true");
    return res.status(201).json({
      status: "success",
      message: `Charged ${payment.amount} ${payment.currency}`,
    });
  }

  // User Story 3: Different Request, Same Key (Fraud/Error Check)
  payment = await prisma.payment.findUnique({
    where: {
      idempotencyKey: idempotencyKey, // complete check for same key for diffreent request
    },
  });

  if (
    payment &&
    payment.amount !== payload.amount &&
    payment.currency !== payload.currency
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
  const payload: Payload = req.body;

  if (!user) {
    throw new AppError("Unauthorized user", 401, "UNAUTHORIZED");
  }

  const balance = await prisma.user.findUnique({
    where: {
      id: user.id,
      email: user.email,
    },
    select: {
      balance: true,
    },
  });

  if (payload.amount >= balance) {
    return res.status(400).json({
      status: "fail",
      message: "You do not have enough funds to perform this transaction!",
    });
  }

  next();
};
