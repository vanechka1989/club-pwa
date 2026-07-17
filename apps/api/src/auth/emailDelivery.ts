import nodemailer from "nodemailer";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "../db/client";
import { emailDeliveryLog } from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import {
  EMAIL_DAILY_RECIPIENT_LIMIT,
  EMAIL_MAX_RECIPIENTS_PER_MESSAGE,
  EMAIL_QUOTA_WINDOW_MS,
  EMAIL_RATE_INTERVAL_MS,
  getEmailQuotaSnapshot
} from "../mailings/emailPolicy";

type EmailHeaders = Record<string, string>;
type SmtpTransport = ReturnType<typeof nodemailer.createTransport>;
let smtpTransport: SmtpTransport | null = null;
let nextEmailDeliveryAt = 0;
let emailQuotaLock = Promise.resolve();

export type EmailDeliveryCategory = "auth" | "mailing" | "mailing_test" | "transactional";

export class EmailDailyLimitError extends Error {
  constructor(public readonly retryAt: Date) {
    super("Суточный лимит email исчерпан. Отправка продолжится автоматически после освобождения лимита.");
    this.name = "EmailDailyLimitError";
  }
}

async function withEmailQuotaLock<T>(operation: () => Promise<T>) {
  const previous = emailQuotaLock;
  let release = () => {};
  emailQuotaLock = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

async function getActiveEmailDeliveryRows(now = new Date()) {
  const cutoff = new Date(now.getTime() - EMAIL_QUOTA_WINDOW_MS);
  const staleReservationCutoff = new Date(now.getTime() - 10 * 60 * 1_000);
  await db
    .update(emailDeliveryLog)
    .set({ status: "failed", error: "Stale email delivery reservation", updatedAt: now })
    .where(and(eq(emailDeliveryLog.status, "processing"), lt(emailDeliveryLog.createdAt, staleReservationCutoff)));
  return db
    .select({ recipientCount: emailDeliveryLog.recipientCount, createdAt: emailDeliveryLog.createdAt })
    .from(emailDeliveryLog)
    .where(and(inArray(emailDeliveryLog.status, ["processing", "sent"]), gte(emailDeliveryLog.createdAt, cutoff)));
}

function expandEmailDeliveryTimes(rows: Array<{ recipientCount: number; createdAt: Date }>) {
  return rows.flatMap((row) => Array.from({ length: row.recipientCount }, () => row.createdAt.getTime()));
}

export async function getEmailDeliveryQuota(now = new Date()) {
  const rows = await getActiveEmailDeliveryRows(now);
  return getEmailQuotaSnapshot({ deliveryTimes: expandEmailDeliveryTimes(rows), nowMs: now.getTime() });
}

export async function getRecentEmailDeliveryTimes(now = new Date()) {
  return expandEmailDeliveryTimes(await getActiveEmailDeliveryRows(now));
}

async function reserveEmailQuota(recipientCount: number, category: EmailDeliveryCategory) {
  return withEmailQuotaLock(async () => {
    const now = new Date();
    const rows = await getActiveEmailDeliveryRows(now);
    const used = rows.reduce((total, row) => total + row.recipientCount, 0);
    if (used + recipientCount > EMAIL_DAILY_RECIPIENT_LIMIT) {
      const oldest = rows.reduce<Date | null>((value, row) => (!value || row.createdAt < value ? row.createdAt : value), null);
      throw new EmailDailyLimitError(new Date((oldest?.getTime() ?? now.getTime()) + EMAIL_QUOTA_WINDOW_MS + 1_000));
    }
    const [reservation] = await db
      .insert(emailDeliveryLog)
      .values({ category, recipientCount, status: "processing", createdAt: now, updatedAt: now })
      .returning({ id: emailDeliveryLog.id });
    if (!reservation) throw new Error("Unable to reserve email delivery quota");
    return reservation.id;
  });
}

async function waitForEmailRateSlot() {
  const delayMs = Math.max(0, nextEmailDeliveryAt - Date.now());
  if (delayMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  nextEmailDeliveryAt = Math.max(Date.now(), nextEmailDeliveryAt) + EMAIL_RATE_INTERVAL_MS;
}

function buildDkimConfig() {
  if (!env.DKIM_DOMAIN || !env.DKIM_SELECTOR || !env.DKIM_PRIVATE_KEY) {
    return undefined;
  }

  return {
    domainName: env.DKIM_DOMAIN,
    keySelector: env.DKIM_SELECTOR,
    privateKey: env.DKIM_PRIVATE_KEY.replace(/\\n/g, "\n")
  };
}

function getSmtpTransport() {
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      dkim: buildDkimConfig(),
      auth:
        env.SMTP_USER && env.SMTP_PASSWORD
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASSWORD
            }
          : undefined
    });
  }
  return smtpTransport;
}

export async function sendEmail(input: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  headers?: EmailHeaders;
  category?: EmailDeliveryCategory;
}) {
  const recipients = (Array.isArray(input.to) ? input.to : [input.to]).map((value) => value.trim()).filter(Boolean);
  if (!recipients.length) throw new Error("Email recipient is required");
  if (recipients.length > EMAIL_MAX_RECIPIENTS_PER_MESSAGE) {
    throw new Error(`В одном письме допускается не более ${EMAIL_MAX_RECIPIENTS_PER_MESSAGE} получателей.`);
  }
  if (!env.SMTP_HOST || !env.SMTP_PORT) {
    if (env.AUTH_DEV_CODE_ENABLED) {
      logger.info({ to: input.to, subject: input.subject, text: input.text }, "email delivery skipped in dev code mode");
      return;
    }

    if (env.NODE_ENV === "production") {
      throw new Error("SMTP is not configured");
    }

    logger.info({ to: input.to, subject: input.subject, text: input.text }, "email delivery skipped without SMTP");
    return;
  }

  const transporter = getSmtpTransport();
  const reservationId = await reserveEmailQuota(recipients.length, input.category ?? "transactional");
  try {
    await waitForEmailRateSlot();
    const result = await transporter.sendMail({
      from: env.SMTP_FROM,
      to: recipients,
      subject: input.subject,
      text: input.text,
      html: input.html,
      headers: input.headers
    });
    const now = new Date();
    await db
      .update(emailDeliveryLog)
      .set({ status: "sent", sentAt: now, messageId: result.messageId, updatedAt: now })
      .where(eq(emailDeliveryLog.id, reservationId));

    logger.info(
      {
        to: recipients,
        subject: input.subject,
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected
      },
      "email delivered through SMTP"
    );
  } catch (error) {
    await db
      .update(emailDeliveryLog)
      .set({ status: "failed", error: error instanceof Error ? error.message : "SMTP delivery failed", updatedAt: new Date() })
      .where(eq(emailDeliveryLog.id, reservationId));
    throw error;
  }
}
