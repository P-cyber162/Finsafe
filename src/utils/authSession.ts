import type { Response } from "express";
import crypto from "crypto";
import { env } from "../env.js";

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const sha256 = (value: string): string =>
  crypto.createHash("sha256").update(value).digest("hex");

const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: env.NODE_ENV === "prod",
  sameSite: "strict" as const,
  maxAge,
  path: "/",
});

export const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
) => {
  res.cookie("token", accessToken, cookieOptions(ACCESS_TOKEN_MAX_AGE_MS));
  res.cookie(
    "refreshToken",
    refreshToken,
    cookieOptions(REFRESH_TOKEN_MAX_AGE_MS),
  );
};

export const clearAuthCookies = (res: Response) => {
  const baseOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "prod",
    sameSite: "strict" as const,
    path: "/",
  };

  res.clearCookie("token", baseOptions);
  res.clearCookie("refreshToken", baseOptions);
};
