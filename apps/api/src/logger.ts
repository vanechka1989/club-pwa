import pino from "pino";
import { env } from "./env";

export const logger = pino(
  env.NODE_ENV === "production"
    ? { level: "info" }
    : {
        level: "debug",
        transport: {
          target: "pino-pretty",
          options: { colorize: true }
        }
      }
);
