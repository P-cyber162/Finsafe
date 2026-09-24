import type { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync";
import { wideLoggger } from "../utils/wideLogger";
import { AppError } from "../utils/AppError";
import { prisma } from "../config/prisma";
import { processPaymentSchema } from "../schema/payment.schema";
import { env } from "../env";

const userBalance = env.USER_BALANCE;

export const processPayment = catchAsync(
  async (req: Request, res: Response) => {
    const user = req.user;

    if (!user) {
      throw new AppError("Unauthorized user", 401, "UNAUTHORIZED");
    }

    const input = req.body;
    const result = processPaymentSchema.safeParse(input);
    const idempotencyKey = req.headers["Idempotency-Key"];

    if (!result) {
      throw new AppError("Bad request!", 400, "BAD_REQUEST");
    }

    const payload = result.data;

    // User Story 1: The First Transaction (Happy Path)
    const payment = await prisma.payment.create({
      where: {
        email: user.email,
      },
      data: {
        email: user.email,
        idempotencyKey: idempotencyKey,
        amount: payload?.amount,
        currency: payload?.currency,
      },
    });

    const balance = await prisma.user.findUnique({
      where: {
        id: user.id,
        email: user.email,
      },
      select: {
        balance: true,
      },
    });

    const userBalance = balance?.balance - (payload?.amount ?? 0);

    await prisma.user.update({
      where: {
        id: user.id,
        email: user.email,
      },
      data: {
        balance: userBalance,
      },
    });

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
      email: user.email,
    },
    data: {
      balance: parseInt(userBalance),
    },
  });

  return res.status(200).json({
    status: "success",
    message: `Your balance has been reset to ${userBalance}`,
  });
});
