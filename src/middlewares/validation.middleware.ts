import type { Request, Response, NextFunction } from "express";
import { type ZodType, type ZodError } from "zod";

const buildValidationError = (
  res: Response,
  message: string,
  error: ZodError,
) => {
  return res.status(400).json({
    status: "error",
    code: "VALIDATION_FAILED",
    message,
    details: error.issues.map((e) => ({
      field: e.path.join("."),
      code: e.code,
      message: e.message,
    })),
  });
};

export const validateBody = (schema: ZodType<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return buildValidationError(res, "Validation failed!", result.error);
    }
    req.body = result.data;
    next();
  };
};

export const validateParams = (schema: ZodType<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return buildValidationError(res, "Invalid params!", result.error);
    }
    req.params = result.data as Record<string, string>;
    next();
  };
};

export const validateQuery = (schema: ZodType<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return buildValidationError(res, "Invalid query!", result.error);
    }
    // Express 5 defines `req.query` as a prototype getter, so a plain
    // assignment throws. Shadow it with an own, configurable property.
    Object.defineProperty(req, "query", {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
};
