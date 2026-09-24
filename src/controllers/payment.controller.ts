import type { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync.js";
import { wideLoggger } from "../utils/wideLogger.js";
import { AppError } from "../utils/AppError.js";
import { prisma } from "../config/prisma.js";
import { processPaymentSchema } from "../schema/payment.schema.js";
import { env } from "../env.js";

const defaultBalance = parseInt(env.USER_BALANCE);

const getIdempotencyKey = (req: Request): string | undefined => {
  const header = req.headers["Idempotency-Key"];
  if (Array.isArray(header)) return header[0];
  return header;
};

export const processPayment = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;

    if (!user) {
      throw new AppError("Unauthorized user", 401, "UNAUTHORIZED");
    }

    const input = req.body;
    const result = processPaymentSchema.safeParse(input);
    const idempotencyKey = getIdempotencyKey(req);

    if (!result.success) {
      throw new AppError("Bad request!", 400, "BAD_REQUEST");
    }

    if (!idempotencyKey) {
      throw new AppError("Idempotency key missing!", 400, "MISSING_KEY");
    }

    const payload = result.data;

    // User Story 1: The First Transaction (Happy Path)
    const payment = await prisma.payment.create({
      data: {
        email: user.email,
        idempotencyKey,
        amount: payload.amount,
        currency: payload.currency,
      },
    });

    const balance = await prisma.user.findUnique({
      where: {
        id: user.id,
      },
      select: {
        balance: true,
      },
    });

    const newBalance = (balance?.balance ?? 0) - payload.amount;

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        balance: newBalance,
      },
    });

    wideLoggger.addCtx("payment_id", payment.id);
    wideLoggger.addCtx("charged_amount", payment.amount);
    wideLoggger.addCtx("charged_currency", payment.currency);

    return res.status(201).json({
      status: "success",
      message: `Charged ${payment.amount} ${payment.currency}`,
    });
  },
);

export const resetBalance = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;

  if (!user) {
    throw new AppError("Unauthorized user", 401, "UNAUTHORIZED");
  }

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      balance: defaultBalance,
    },
  });

  return res.status(200).json({
    status: "success",
    message: `Your balance has been reset to ${defaultBalance}`,
  });
});
