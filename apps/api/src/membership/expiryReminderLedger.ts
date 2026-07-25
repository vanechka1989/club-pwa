import { and, eq, lte, lt, or, sql } from "drizzle-orm";
import { membershipExpiryReminderDeliveries } from "../db/schema";
import type { ExpiryReminderStage } from "./expiryReminderPlan";

export type ExpiryReminderChannel = "pwa" | "push" | "email";

type DeliveryState = {
  status: string;
  attemptCount: number;
  nextAttemptAt: Date | null;
  updatedAt: Date;
};

const MAX_ATTEMPTS = 3;
const STALE_PROCESSING_MS = 15 * 60_000;

export function getExpiryReminderRetryAt(attemptCount: number, now = new Date()) {
  if (attemptCount >= MAX_ATTEMPTS) return null;
  const delayMs = attemptCount === 1 ? 15 * 60_000 : 60 * 60_000;
  return new Date(now.getTime() + delayMs);
}

export function isExpiryReminderDeliveryClaimable(delivery: DeliveryState | null, now = new Date()) {
  if (!delivery) return true;
  if (delivery.attemptCount >= MAX_ATTEMPTS || delivery.status === "sent") return false;
  if (delivery.status === "failed") return !delivery.nextAttemptAt || delivery.nextAttemptAt <= now;
  return delivery.status === "processing" && delivery.updatedAt.getTime() <= now.getTime() - STALE_PROCESSING_MS;
}

export async function claimExpiryReminderDelivery(input: {
  subscriptionId: string;
  userId: string;
  expiresAt: Date;
  stage: ExpiryReminderStage;
  channel: ExpiryReminderChannel;
  now?: Date;
}) {
  const { db } = await import("../db/client");
  const now = input.now ?? new Date();
  const values = {
    subscriptionId: input.subscriptionId,
    userId: input.userId,
    expiresAt: input.expiresAt,
    stage: input.stage,
    channel: input.channel,
    status: "processing",
    attemptCount: 1,
    lastAttemptAt: now,
    createdAt: now,
    updatedAt: now
  } as const;
  const [created] = await db
    .insert(membershipExpiryReminderDeliveries)
    .values(values)
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_MS);
  const [reclaimed] = await db
    .update(membershipExpiryReminderDeliveries)
    .set({
      status: "processing",
      attemptCount: sql`${membershipExpiryReminderDeliveries.attemptCount} + 1`,
      nextAttemptAt: null,
      lastAttemptAt: now,
      error: null,
      updatedAt: now
    })
    .where(
      and(
        eq(membershipExpiryReminderDeliveries.subscriptionId, input.subscriptionId),
        eq(membershipExpiryReminderDeliveries.expiresAt, input.expiresAt),
        eq(membershipExpiryReminderDeliveries.stage, input.stage),
        eq(membershipExpiryReminderDeliveries.channel, input.channel),
        lt(membershipExpiryReminderDeliveries.attemptCount, MAX_ATTEMPTS),
        or(
          and(
            eq(membershipExpiryReminderDeliveries.status, "failed"),
            or(
              lte(membershipExpiryReminderDeliveries.nextAttemptAt, now),
              sql`${membershipExpiryReminderDeliveries.nextAttemptAt} is null`
            )
          ),
          and(eq(membershipExpiryReminderDeliveries.status, "processing"), lte(membershipExpiryReminderDeliveries.updatedAt, staleBefore))
        )
      )
    )
    .returning();

  return reclaimed ?? null;
}

export async function completeExpiryReminderDelivery(
  id: string,
  result: { status: "sent" } | { status: "failed"; error: string },
  now = new Date()
) {
  const { db } = await import("../db/client");
  if (result.status === "sent") {
    await db
      .update(membershipExpiryReminderDeliveries)
      .set({ status: "sent", sentAt: now, nextAttemptAt: null, error: null, updatedAt: now })
      .where(eq(membershipExpiryReminderDeliveries.id, id));
    return;
  }

  const delivery = await db.query.membershipExpiryReminderDeliveries.findFirst({
    where: eq(membershipExpiryReminderDeliveries.id, id)
  });
  if (!delivery) return;
  await db
    .update(membershipExpiryReminderDeliveries)
    .set({
      status: "failed",
      nextAttemptAt: getExpiryReminderRetryAt(delivery.attemptCount, now),
      error: result.error.slice(0, 2_000),
      updatedAt: now
    })
    .where(eq(membershipExpiryReminderDeliveries.id, id));
}
