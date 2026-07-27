import nodemailer from "nodemailer";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { clubSettings, errorNotificationDeliveries, users } from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import { getOwnerTelegramId } from "../admin/roles";
import { sendWebPushToUsers } from "../push/webPush";
import { dispatchErrorNotifications } from "./notifications";
import { postgresErrorTrackerRepository } from "./postgresRepository";
import { createErrorTrackerStore, type ErrorIdentity } from "./store";
import type { ErrorGroupStatus, RawErrorEvent } from "./domain";

export const errorTrackerEmailSettingKey = "error_tracker_email";
export const errorTrackerEmailEnabledSettingKey = "error_tracker_email_enabled";
export const errorTrackerPushEnabledSettingKey = "error_tracker_push_enabled";
const settingKeys = [errorTrackerEmailSettingKey, errorTrackerEmailEnabledSettingKey, errorTrackerPushEnabledSettingKey];
const store = createErrorTrackerStore(postgresErrorTrackerRepository);

function enabledValue(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value === "true";
}

export async function getErrorTrackerSettings() {
  const [ownerEmail, settings] = await Promise.all([
    getOwnerTelegramId(),
    db.query.clubSettings.findMany({ where: inArray(clubSettings.key, settingKeys) })
  ]);
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  const configuredEmail = values.get(errorTrackerEmailSettingKey)?.trim() ?? ownerEmail;
  return {
    email: configuredEmail || null,
    emailEnabled: enabledValue(values.get(errorTrackerEmailEnabledSettingKey), true),
    pushEnabled: enabledValue(values.get(errorTrackerPushEnabledSettingKey), true)
  };
}

export async function saveErrorTrackerSettings(input: { email: string | null; emailEnabled: boolean; pushEnabled: boolean }, actorUserId: string | null) {
  const values = [
    { key: errorTrackerEmailSettingKey, value: input.email?.trim().toLowerCase() ?? "" },
    { key: errorTrackerEmailEnabledSettingKey, value: String(input.emailEnabled) },
    { key: errorTrackerPushEnabledSettingKey, value: String(input.pushEnabled) }
  ];
  await db.transaction(async (tx) => {
    for (const item of values) {
      await tx.insert(clubSettings).values({ ...item, updatedByUserId: actorUserId, updatedAt: new Date() }).onConflictDoUpdate({
        target: clubSettings.key,
        set: { value: item.value, updatedByUserId: actorUserId, updatedAt: new Date() }
      });
    }
  });
  return getErrorTrackerSettings();
}

async function resolveRecipientUserIds() {
  const ownerEmail = await getOwnerTelegramId();
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.telegramId, ownerEmail));
  return rows.map((row) => row.id);
}

async function sendErrorEmail(input: { to: string; subject: string; text: string; html: string }) {
  if (!env.SMTP_HOST || !env.SMTP_PORT) throw new Error("SMTP is not configured");
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    requireTLS: env.SMTP_PORT === 587,
    auth: env.SMTP_USER && env.SMTP_PASSWORD ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined
  });
  try {
    await transporter.sendMail({ from: env.SMTP_FROM, ...input });
  } finally {
    transporter.close();
  }
}

async function dispatchRecordedError(group: Awaited<ReturnType<typeof store.record>>["group"]) {
  try {
    const [settings, recipientUserIds] = await Promise.all([getErrorTrackerSettings(), resolveRecipientUserIds()]);
    await dispatchErrorNotifications(group, {
      origin: env.WEB_ORIGIN,
      recipientUserIds,
      email: settings.email,
      pushEnabled: settings.pushEnabled,
      emailEnabled: settings.emailEnabled,
      sendPush: sendWebPushToUsers,
      sendEmail: sendErrorEmail,
      recordDelivery: async (delivery) => {
        await db.insert(errorNotificationDeliveries).values({
          groupId: group.id,
          channel: delivery.channel,
          status: delivery.status,
          attemptCount: delivery.status === "skipped" ? 0 : 1,
          lastError: delivery.error,
          updatedAt: new Date()
        });
      }
    });
  } catch (error) {
    logger.warn({ error, errorGroupId: group.id }, "error tracker notification dispatch failed");
  }
}

export async function recordTrackedError(input: RawErrorEvent, identity: ErrorIdentity) {
  const recorded = await store.record(input, identity);
  if (recorded.shouldNotify) {
    await store.markNotified(recorded.group.id, new Date());
    void dispatchRecordedError(recorded.group);
  }
  return recorded;
}

export function updateTrackedErrorStatus(groupId: string, status: ErrorGroupStatus) {
  return store.updateStatus(groupId, status);
}
