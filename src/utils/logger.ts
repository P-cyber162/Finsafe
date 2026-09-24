import pino from "pino";
import { env } from "../env.js";

const isDev = env.NODE_ENV === "dev";

export const logger = pino(
  isDev
    ? {
        level: "info",
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: true,
            ignore: "pid,hostname",
            singleLine: false,
            depth: 3,
          },
        },
      }
    : {
        level: "info",
        transport: {
          target: "pino/file",
        },
      },
);
