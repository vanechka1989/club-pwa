import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { adminMailingEvents, adminMailingRecipients } from "../db/schema";

export type MailingTrackingEventPurpose = "open" | "push" | "click";

export function getMailingEventKey(purpose: MailingTrackingEventPurpose, destination?: string) {
  if (purpose !== "click") return "open";
  if (!destination) throw new Error("Click destination is required");
  return `click:${createHash("sha256").update(destination).digest("hex")}`;
}

export async function recordMailingTrackingEvent(input: {
  recipientId: string;
  purpose: MailingTrackingEventPurpose;
  destination?: string;
  occurredAt?: Date;
}) {
  const { db } = await import("../db/client");
  const recipient = await db.query.adminMailingRecipients.findFirst({
    where: eq(adminMailingRecipients.id, input.recipientId)
  });
  if (!recipient) return false;

  const eventType = input.purpose === "click" ? "click" : "open";
  const inserted = await db
    .insert(adminMailingEvents)
    .values({
      mailingId: recipient.mailingId,
      recipientId: recipient.id,
      eventType,
      eventKey: getMailingEventKey(input.purpose, input.destination),
      destination: eventType === "click" ? input.destination ?? null : null,
      occurredAt: input.occurredAt ?? new Date()
    })
    .onConflictDoNothing({
      target: [adminMailingEvents.recipientId, adminMailingEvents.eventKey]
    })
    .returning({ id: adminMailingEvents.id });

  return inserted.length > 0;
}
