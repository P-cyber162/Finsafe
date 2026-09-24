import { createSecretKey, randomUUID } from "crypto";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../env.js";

export interface JwtPayload {
  id: string;
  email: string;
}

export const generateRefreshToken = (payload: JwtPayload) => {
  const secret = env.REFRESH_TOKEN_SECRET;
  const secretKey = createSecretKey(secret, "utf-8");

  return new SignJWT(payload as Record<string, any>)
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(env.REFRESH_TOKEN_EXPIRES_IN || "7d")
    .sign(secretKey);
};

export const generateAccessToken = (payload: JwtPayload) => {
  const secret = env.ACCESS_TOKEN_SECRET;
  const secretKey = createSecretKey(secret, "utf-8");

  return new SignJWT(payload as Record<string, any>)
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(env.ACCESS_TOKEN_EXPIRES_IN || "15m")
    .sign(secretKey);
};

export const verifyAccessToken = async (token: string) => {
  const secretKey = createSecretKey(env.ACCESS_TOKEN_SECRET, "utf-8");
  const { payload } = await jwtVerify(token, secretKey);

  return payload as unknown as JwtPayload;
};

export const verifyRefreshToken = async (token: string) => {
  const secretKey = createSecretKey(env.REFRESH_TOKEN_SECRET, "utf-8");
  const { payload } = await jwtVerify(token, secretKey);
  return payload as unknown as JwtPayload;
};
