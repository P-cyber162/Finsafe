import express from "express";
import fs from "node:fs";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import YAML from "yaml";
import { env } from "./env.js";
import { AppError } from "./utils/AppError.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import { WideLoggerMiddleware } from "./middlewares/wideLogger.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import paymentRoutes from "./routes/payment.routes.js";

const app = express();

app.set("trust-proxy", 1);

const allowedOrigins = [env.FRONTEND_URL, "http://localhost:5173"].filter(
  (o): o is string => Boolean(o),
);

const isAllowedOrigin = (origin: string): boolean => {
  if (allowedOrigins.includes(origin)) return true;

  try {
    const { hostname, protocol } = new URL(origin);

    if (protocol !== "https://") return false;
    return (
      hostname === env.FRONTEND_URL.replace("https://", "").trim() ||
      hostname.endsWith(env.FRONTEND_URL.replace("https://", ".").trim())
    );
  } catch {
    return false;
  }
};

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (isAllowedOrigin(origin)) return callback(null, true);

    if (
      env.NODE_ENV === "dev" &&
      (origin.startsWith("http:localhost:") ||
        origin.startsWith("https:localhost:") ||
        origin.includes("ngrok"))
    ) {
      return callback(null, true);
    }

    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type", "x-client-Platform"],
  maxAge: 86400,
};

app.use(cors(corsOptions));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
);

app.use(express.json({ limit: "100 kb" }));
app.use(express.urlencoded({ extended: true, limit: "100 kb" }));
app.use(compression({ threshold: 1024 }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "OK",
    service: "Transactional App Service",
    date: new Date(),
  });
});

app.use(WideLoggerMiddleware);

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/transaction", paymentRoutes);

app.all("/.*/", (req, _res, next) => {
  next(
    new AppError(
      `Can't find $${req.originalUrl} on server`,
      404,
      "PAGE_NOT_FOUND",
    ),
  );
});

app.use(errorHandler);

export { app };
