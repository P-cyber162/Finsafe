import type { Request, Response, NextFunction } from "express";
import { env } from "../env.js";
import { wideLoggger, type WideLoggerContext } from "../utils/wideLogger.js";
import { randomUUID } from "crypto";
import os from "os";
import { logger } from "../utils/logger.js";

export const WideLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const start = process.hrtime();

  const initialContext: WideLoggerContext = {
    ts: new Date().toISOString(),
    sev: "INFO",
    msg: "http_request_finished",
    trace: {
      traceId: randomUUID(),
      spanId: randomUUID(),
      parentId: req.get("X-Parent-Span-Id") || undefined,
    },
    http: {
      method: req.method,
      route: req.path,
      path: req.path,
      user_agent: req.headers["user-agent"] || "",
      ip: req.ip || "",
    },
    ctx: {},
    host: {
      name: os.hostname(),
      ver: env.NPM_PACKAGE_VERSION,
    },
  };

  wideLoggger.init(initialContext, () => {
    res.on("finish", () => {
      const store = wideLoggger.get();
      if (!store) return;

      const diff = process.hrtime(start);
      const durationMs = (diff[0] * 1e9 + diff[1]) / 1e6;

      store.http.status = res.statusCode;
      store.http.duration_ms = durationMs;

      if (req.route) {
        store.http.route = req.baseUrl + req.route.path;
      }

      if (res.statusCode >= 500) {
        logger.error(store, "http_request_finished");
      } else if (res.statusCode >= 400) {
        logger.warn(store, "http_request_finished");
      } else {
        logger.info(store, "http_request_finished");
      }
    });
    next();
  });
};
