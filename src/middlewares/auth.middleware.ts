import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type JwtPayload } from "../utils/jwt.js";
export interface AuthenticatedRequest extends Omit<Request, "user"> {
  user?: JwtPayload | undefined;
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers["authorization"];
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : undefined;
  const token = bearerToken || req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      status: "error",
      code: "MISSING_TOKEN",
      message: "No token provided",
    });
  }

  try {
    const payload = await verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof Error) {
      // Distinguish expired vs invalid
      if (error.message.includes("expired")) {
        return res.status(401).json({
          status: "error",
          code: "TOKEN_EXPIRED",
          message: "Token has expired",
        });
      }
    }
    return res.status(401).json({
      status: "error",
      code: "INVALID_TOKEN",
      message: "Invalid token",
    });
  }
};
