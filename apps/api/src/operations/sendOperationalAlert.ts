import nodemailer from "nodemailer";
import { env } from "../env";
import { buildOperationalAlertEmail, type OperationalAlertSeverity } from "./operationalAlertEmail";

const allowedSeverities = new Set(["warning", "critical", "emergency", "recovered"]);
const severity = (allowedSeverities.has(process.argv[2] ?? "") ? process.argv[2]! : "warning") as OperationalAlertSeverity;
const detail = (process.argv[3] ?? "Operational monitor changed state").slice(0, 4000);

if (!env.SMTP_HOST) {
  throw new Error("SMTP_HOST is required for operational alerts");
}

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT ?? 587,
  secure: (env.SMTP_PORT ?? 587) === 465,
  auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined
});

const message = buildOperationalAlertEmail({ severity, detail, configuredFrom: env.SMTP_FROM });
await transporter.sendMail({ ...message, to: env.OWNER_EMAIL });
transporter.close();
console.log(JSON.stringify({ ok: true, severity }));
process.exit(0);
