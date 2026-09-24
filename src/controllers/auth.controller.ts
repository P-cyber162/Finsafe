import type { Request, Response } from "express";
import { catchAsync } from "../utils/catchAsync.js";
import { loginSchema, registerSchema } from "../schema/auth.schema.js";
import { AppError } from "../utils/AppError.js";
import { comparePasswords, hashPassword } from "../utils/password.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt.js";
import { prisma } from "../config/prisma.js";
import { clearAuthCookies, setAuthCookies } from "../utils/authSession.js";
import { env } from "../env.js";
import { wideLoggger } from "../utils/wideLogger.js";

export const registerUser = catchAsync(async (req: Request, res: Response) => {
  const input = req.body;
  const result = registerSchema.safeParse(input);

  if (!result.success) {
    throw new AppError("Bad request!", 400, "BAD_REQUEST");
  }

  const payload = result.data;

  const existingUser = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (existingUser) {
    throw new AppError(
      "An account with this email already exits",
      409,
      "CONFLICT",
    );
  }

  const hashedPassword = await hashPassword(payload.password);

  const newUser = await prisma.user.create({
    data: {
      email: payload.email,
      password: hashedPassword,
    },
  });

  const accessToken = await generateAccessToken({
    id: newUser.id,
    email: newUser.email,
  });

  const refreshToken = await generateRefreshToken({
    id: newUser.id,
    email: newUser.email,
  });

  const hashedRefreshToken = await hashPassword(refreshToken);

  const now = new Date();
  const expireTime = now.setDate(now.getDate() + 7);

  await prisma.user.update({
    where: {
      email: payload.email,
    },
    data: {
      refreshToken: hashedRefreshToken,
      refreshTokenExpires: new Date(expireTime),
    },
  });

  setAuthCookies(res, accessToken, refreshToken);

  return res.status(201).json({
    status: "success",
    message: "User account successfully created",
    accessToken,
    refreshToken,
    user: {
      id: newUser.id,
      email: newUser.email,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
    },
  });
});

export const loginUser = catchAsync(async (req: Request, res: Response) => {
  const input = req.body;
  const result = loginSchema.safeParse(input);

  if (!result.success) {
    throw new AppError("Bad request!", 400, "BAD_REQUEST");
  }

  const payload = result.data;

  const existingUser = await prisma.user.findUnique({
    where: {
      email: payload.email,
    },
  });

  if (!existingUser) {
    throw new AppError("Invalid email or password!", 400, "BAD_REQUEST");
  }

  const isMatch = await comparePasswords(
    payload.password,
    existingUser.password ?? "",
  );

  if (!isMatch) {
    throw new AppError("Invalid email or password!", 401, "UNAUTHORIZED");
  }

  const accessToken = await generateAccessToken({
    id: existingUser.id,
    email: existingUser.email,
  });

  const refreshToken = await generateRefreshToken({
    id: existingUser.id,
    email: existingUser.email,
  });

  const hashedRefreshToken = await hashPassword(refreshToken);

  const expireTime = new Date();
  expireTime.setDate(expireTime.getDate() + 7);

  await prisma.user.update({
    where: {
      email: payload.email,
    },
    data: {
      refreshToken: hashedRefreshToken,
      refreshTokenExpires: expireTime,
    },
  });

  setAuthCookies(res, accessToken, refreshToken);

  return res.status(200).json({
    status: "success",
    message: "User logged in succesfully!",
    accessToken,
    refreshToken,
    user: existingUser,
  });
});

export const logoutUser = catchAsync(async (req: Request, res: Response) => {
  const user = req.user;

  if (!user) {
    throw new AppError("Unauthorized!", 400, "UNAUTHORIZED");
  }

  await prisma.user.update({
    where: {
      email: user.email,
    },
    data: {
      refreshToken: null,
      refreshTokenExpires: null,
    },
  });

  clearAuthCookies(res);

  return res.status(200).json({
    status: "success",
    message: "User logged out succesfully!",
  });
});

// Refresh token handler
export const refreshToken = catchAsync(async (req: Request, res: Response) => {
  wideLoggger.addCtx("action", "refresh_token");
  const refreshToken: string | undefined =
    req.body.refreshToken ?? req.cookies?.refreshToken;

  if (!refreshToken) {
    wideLoggger.addCtx("refresh_token_result", "missing_token");
    throw new AppError("Refresh token required!", 401, "MISSING_TOKEN");
  }

  const payload = await verifyRefreshToken(refreshToken);

  const user = await prisma.user.findUnique({
    where: {
      id: payload.id,
      refreshTokenExpires: { gt: new Date() },
    },
  });

  if (!user || !user.refreshToken) {
    wideLoggger.addCtx("refresh_token_result", "invalid_user_or_expired");
    throw new AppError(
      "Invalid or expired refresh token!",
      401,
      "INVALID_TOKEN",
    );
  }

  wideLoggger.addCtx("user_id", user.id);
  const isMatch = await comparePasswords(refreshToken, user.refreshToken!);

  if (!isMatch) {
    wideLoggger.addCtx("refresh_token_result", "mismatch");
    throw new AppError(
      "Invalid or expired refresh token!",
      401,
      "INVALID_TOKEN",
    );
  }

  const newAccessToken = await generateAccessToken({
    id: user.id,
    email: user.email,
  });

  // Rotate the refresh token on every use: extends the 7-day window for
  // active users (instead of forcing a re-login exactly 7 days after the
  // original login) and invalidates the old token.
  const newRefreshToken = await generateRefreshToken({
    id: user.id,
    email: user.email,
  });

  const hashedRefreshToken = await hashPassword(newRefreshToken);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshToken: hashedRefreshToken,
      refreshTokenExpires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  res.cookie("token", newAccessToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "prod",
    sameSite: "strict",
    maxAge: 15 * 60 * 1000,
  });

  res.cookie("refreshToken", newRefreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "prod",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  wideLoggger.addCtx("refresh_token_result", "success");
  return res.status(200).json({
    status: "success",
    data: {
      newAccessToken,
      newRefreshToken,
    },
  });
});
