import nodemailer from "nodemailer";
import { env } from "../env";
import { logger } from "../logger";

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

export async function sendEmail(input: { to: string; subject: string; text: string }) {
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

  const transporter = nodemailer.createTransport({
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

  const result = await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text
  });

  logger.info(
    {
      to: input.to,
      subject: input.subject,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected
    },
    "email delivered through SMTP"
  );
}
