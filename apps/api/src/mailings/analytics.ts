import { and, eq } from "drizzle-orm";
import { resolveDisplayName, type AdminMailingAnalytics, type AdminMailingAnalyticsRecipientsResponse } from "@club/shared";
import { adminMailingEvents, adminMailingRecipients, adminMailings } from "../db/schema";

export type MailingAnalyticsRecipientFact = {
  id: string;
  channel: string;
  status: string;
  sentAt: Date | null;
};

export type MailingAnalyticsEventFact = {
  recipientId: string;
  eventType: string;
  destination: string | null;
  occurredAt: Date;
};

function rate(value: number, total: number) {
  return total ? Math.round((value / total) * 1000) / 10 : 0;
}

function hourBucket(value: Date) {
  const bucket = new Date(value);
  bucket.setUTCMinutes(0, 0, 0);
  return bucket.toISOString();
}

export function getRecipientAnalyticsStatus(deliveryStatus: string, opened: boolean, clicked: boolean) {
  if (clicked) return "clicked" as const;
  if (opened) return "opened" as const;
  if (deliveryStatus === "sent") return "delivered" as const;
  if (deliveryStatus === "failed") return "failed" as const;
  if (deliveryStatus.startsWith("skipped_")) return "skipped" as const;
  return "pending" as const;
}

export function buildMailingAnalytics(
  recipients: MailingAnalyticsRecipientFact[],
  events: MailingAnalyticsEventFact[],
) {
  const openedIds = new Set(events.filter((event) => event.eventType === "open").map((event) => event.recipientId));
  const clickedIds = new Set(events.filter((event) => event.eventType === "click").map((event) => event.recipientId));
  const sent = recipients.filter((recipient) => recipient.status === "sent").length;
  const summary = {
    sent,
    opened: openedIds.size,
    clicked: clickedIds.size,
    openRate: rate(openedIds.size, sent),
    clickRate: rate(clickedIds.size, sent),
    clickToOpenRate: rate(clickedIds.size, openedIds.size),
  };

  const channels = (["push", "email"] as const).map((channel) => {
    const channelRecipients = recipients.filter((recipient) => recipient.channel === channel);
    const ids = new Set(channelRecipients.map((recipient) => recipient.id));
    const channelSent = channelRecipients.filter((recipient) => recipient.status === "sent").length;
    const opened = [...openedIds].filter((id) => ids.has(id)).length;
    const clicked = [...clickedIds].filter((id) => ids.has(id)).length;
    return {
      channel,
      sent: channelSent,
      failed: channelRecipients.filter((recipient) => recipient.status === "failed").length,
      skipped: channelRecipients.filter((recipient) => recipient.status.startsWith("skipped_")).length,
      opened,
      clicked,
      openRate: rate(opened, channelSent),
      clickRate: rate(clicked, channelSent),
    };
  });

  const linkMap = new Map<string, Set<string>>();
  for (const event of events) {
    if (event.eventType !== "click" || !event.destination) continue;
    const recipientsForLink = linkMap.get(event.destination) ?? new Set<string>();
    recipientsForLink.add(event.recipientId);
    linkMap.set(event.destination, recipientsForLink);
  }
  const links = [...linkMap.entries()]
    .map(([destination, ids]) => ({ destination, uniqueClicks: ids.size }))
    .sort((left, right) => right.uniqueClicks - left.uniqueClicks || left.destination.localeCompare(right.destination));

  const timelineMap = new Map<string, { sent: Set<string>; opened: Set<string>; clicked: Set<string> }>();
  const getTimelineBucket = (value: Date) => {
    const key = hourBucket(value);
    const bucket = timelineMap.get(key) ?? { sent: new Set<string>(), opened: new Set<string>(), clicked: new Set<string>() };
    timelineMap.set(key, bucket);
    return bucket;
  };
  for (const recipient of recipients) {
    if (recipient.status === "sent" && recipient.sentAt) getTimelineBucket(recipient.sentAt).sent.add(recipient.id);
  }
  for (const event of events) {
    const bucket = getTimelineBucket(event.occurredAt);
    if (event.eventType === "open") bucket.opened.add(event.recipientId);
    if (event.eventType === "click") bucket.clicked.add(event.recipientId);
  }
  const timeline = [...timelineMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucket, values]) => ({ bucket, sent: values.sent.size, opened: values.opened.size, clicked: values.clicked.size }));

  return { summary, channels, timeline, links };
}

export async function getMailingAnalytics(mailingId: string): Promise<AdminMailingAnalytics | null> {
  const { db } = await import("../db/client");
  const mailing = await db.query.adminMailings.findFirst({ where: eq(adminMailings.id, mailingId) });
  if (!mailing) return null;
  const [recipients, events] = await Promise.all([
    db.query.adminMailingRecipients.findMany({ where: eq(adminMailingRecipients.mailingId, mailingId) }),
    db.query.adminMailingEvents.findMany({ where: eq(adminMailingEvents.mailingId, mailingId) }),
  ]);
  return {
    trackingEnabledAt: mailing.analyticsEnabledAt?.toISOString() ?? null,
    emailOpenEstimate: true,
    ...buildMailingAnalytics(recipients, events),
  };
}

export type MailingAnalyticsRecipientQuery = {
  status: "all" | "delivered" | "opened" | "clicked" | "failed" | "skipped" | "pending";
  channel: "all" | "push" | "email";
  limit: number;
  cursor?: string | undefined;
};

export async function getMailingAnalyticsRecipients(
  mailingId: string,
  query: MailingAnalyticsRecipientQuery,
): Promise<AdminMailingAnalyticsRecipientsResponse | null> {
  const { db } = await import("../db/client");
  const mailing = await db.query.adminMailings.findFirst({ where: eq(adminMailings.id, mailingId) });
  if (!mailing) return null;
  const recipients = await db.query.adminMailingRecipients.findMany({
    where: and(
      eq(adminMailingRecipients.mailingId, mailingId),
      ...(query.channel === "all" ? [] : [eq(adminMailingRecipients.channel, query.channel)]),
    ),
    with: { user: true, events: true },
    orderBy: [adminMailingRecipients.createdAt, adminMailingRecipients.id],
  });
  const rows = recipients.map((recipient) => {
    const openEvent = recipient.events.find((event) => event.eventType === "open") ?? null;
    const clickEvents = recipient.events.filter((event) => event.eventType === "click");
    const clickedAt = clickEvents.reduce<Date | null>((earliest, event) => !earliest || event.occurredAt < earliest ? event.occurredAt : earliest, null);
    const analyticsStatus = getRecipientAnalyticsStatus(recipient.status, Boolean(openEvent), clickEvents.length > 0);
    return {
      id: recipient.id,
      userId: recipient.userId,
      telegramId: recipient.telegramId,
      displayName: recipient.user ? resolveDisplayName(recipient.user) : `ID ${recipient.telegramId}`,
      channel: recipient.channel as "push" | "email",
      deliveryStatus: recipient.status,
      analyticsStatus,
      attemptCount: recipient.attemptCount,
      error: recipient.error?.slice(0, 180) ?? null,
      sentAt: recipient.sentAt?.toISOString() ?? null,
      openedAt: openEvent?.occurredAt.toISOString() ?? null,
      clickedAt: clickedAt?.toISOString() ?? null,
    };
  }).filter((row) => query.status === "all" || row.analyticsStatus === query.status);

  const cursorIndex = query.cursor ? rows.findIndex((row) => row.id === query.cursor) : -1;
  const start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
  const page = rows.slice(start, start + query.limit);
  return {
    recipients: page,
    nextCursor: start + query.limit < rows.length ? page.at(-1)?.id ?? null : null,
  };
}
