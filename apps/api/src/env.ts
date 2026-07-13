import { z } from "zod";

const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());
const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  OWNER_EMAIL: z.string().email().default("owner@example.com"),
  ADMIN_EMAILS: z.string().default(""),
  AUTH_LOGIN_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
  AUTH_SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  AUTH_DEV_CODE_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  SMTP_FROM: optionalString.default("Club <no-reply@example.com>"),
  DKIM_DOMAIN: optionalString,
  DKIM_SELECTOR: optionalString,
  DKIM_PRIVATE_KEY: optionalString,
  MAILING_UNSUBSCRIBE_SECRET: optionalString,
  WEB_PUSH_PUBLIC_KEY: optionalString,
  WEB_PUSH_PRIVATE_KEY: optionalString,
  WEB_PUSH_SUBJECT: optionalString.default("mailto:admin@example.com"),
  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_PUBLIC_BASE_URL: optionalUrl,
  S3_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  UPLOADS_DIR: z.string().default("/app/uploads")
});

export const env = envSchema.parse(process.env);
