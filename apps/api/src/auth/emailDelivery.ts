import nodemailer from "nodemailer";
import { env } from "../env";
import { logger } from "../logger";

type EmailHeaders = Record<string, string>;
type SmtpTransport = ReturnType<typeof nodemailer.createTransport>;
let smtpTransport: SmtpTransport | null = null;

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

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string; headers?: EmailHeaders }) {
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

  const result = await transporter.sendMail({
    from: env.SMTP_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    headers: input.headers
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
