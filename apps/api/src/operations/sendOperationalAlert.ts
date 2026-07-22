import nodemailer from "nodemailer";
import { env } from "../env";

const allowedSeverities = new Set(["warning", "critical", "emergency", "recovered"]);
const severity = allowedSeverities.has(process.argv[2] ?? "") ? process.argv[2]! : "warning";
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

const subject = severity === "recovered"
  ? "Club PWA: сервер восстановился"
  : `Club PWA: ${severity === "emergency" ? "авария" : severity === "critical" ? "критическая проблема" : "требуется внимание"}`;

await transporter.sendMail({ from: env.SMTP_FROM, to: env.OWNER_EMAIL, subject, text: detail });
console.log(JSON.stringify({ ok: true, severity }));
