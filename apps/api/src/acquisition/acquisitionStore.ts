import type { AcquisitionDestination, AcquisitionLinkInput } from "@club/shared";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "../db/client";
import { acquisitionLinks, acquisitionVisitors, acquisitionVisits, userAcquisitionAttributions } from "../db/schema";
import { env } from "../env";
import { buildAcquisitionAid, hashAcquisitionVisitorId, isSameAcquisitionWindow, normalizeAcquisitionDestination, normalizeAcquisitionLabel } from "./acquisition";

function acquisitionSecret(explicitSecret?: string) {
  return explicitSecret || env.MAILING_UNSUBSCRIBE_SECRET || env.WEB_PUSH_PRIVATE_KEY || env.DATABASE_URL;
}

export function destinationFromLink(link: typeof acquisitionLinks.$inferSelect): AcquisitionDestination {
  return normalizeAcquisitionDestination(
    link.destinationKind === "module" ? { kind: "module", moduleId: link.destinationModuleId } : { kind: link.destinationKind }
  );
}

export async function createAcquisitionLink(input: AcquisitionLinkInput, actorUserId: string | null) {
  const source = normalizeAcquisitionLabel(input.source) ?? "";
  const medium = normalizeAcquisitionLabel(input.medium) ?? "";
  const campaign = normalizeAcquisitionLabel(input.campaign) ?? "";
  const content = normalizeAcquisitionLabel(input.content);
  const destination = normalizeAcquisitionDestination(input.destination);
  const [created] = await db
    .insert(acquisitionLinks)
    .values({
      aid: buildAcquisitionAid([source, medium, campaign, content].filter(Boolean).join("-") || input.name),
      name: input.name.trim(),
      source,
      medium,
      campaign,
      content,
      destinationKind: destination.kind,
      destinationModuleId: destination.kind === "module" ? destination.moduleId : null,
      createdByUserId: actorUserId
    })
    .returning();
  return created!;
}

export async function setAcquisitionLinkActive(id: string, isActive: boolean) {
  const [updated] = await db.update(acquisitionLinks).set({ isActive, updatedAt: new Date() }).where(eq(acquisitionLinks.id, id)).returning();
  return updated ?? null;
}

export async function recordAcquisitionVisit(input: { aid: string; visitorId: string; occurredAt?: Date; explicitSecret?: string }) {
  const occurredAt = input.occurredAt ?? new Date();
  const link = await db.query.acquisitionLinks.findFirst({ where: eq(acquisitionLinks.aid, input.aid) });
  if (!link) return { accepted: false, destination: { kind: "home" } as AcquisitionDestination };
  const destination = destinationFromLink(link);
  if (!link.isActive) return { accepted: false, destination };

  const visitorHash = hashAcquisitionVisitorId(input.visitorId, acquisitionSecret(input.explicitSecret));
  const [visitor] = await db
    .insert(acquisitionVisitors)
    .values({ visitorHash, firstVisitedAt: occurredAt, lastVisitedAt: occurredAt })
    .onConflictDoUpdate({ target: acquisitionVisitors.visitorHash, set: { lastVisitedAt: occurredAt } })
    .returning();

  const lastVisit = await db.query.acquisitionVisits.findFirst({
    where: and(eq(acquisitionVisits.visitorId, visitor!.id), eq(acquisitionVisits.linkId, link.id)),
    orderBy: [desc(acquisitionVisits.occurredAt)]
  });
  if (lastVisit && isSameAcquisitionWindow(lastVisit.occurredAt, occurredAt)) return { accepted: false, destination };

  const [visit] = await db.insert(acquisitionVisits).values({ visitorId: visitor!.id, linkId: link.id, occurredAt }).returning();
  return { accepted: true, destination, visitId: visit!.id };
}

export async function attachAcquisitionToUser(input: { visitorId: string; userId: string; registeredAt?: Date; explicitSecret?: string }) {
  const registeredAt = input.registeredAt ?? new Date();
  const visitorHash = hashAcquisitionVisitorId(input.visitorId, acquisitionSecret(input.explicitSecret));
  const visitor = await db.query.acquisitionVisitors.findFirst({ where: eq(acquisitionVisitors.visitorHash, visitorHash) });
  if (!visitor) return false;
  const visits = await db
    .select()
    .from(acquisitionVisits)
    .where(and(eq(acquisitionVisits.visitorId, visitor.id), lte(acquisitionVisits.occurredAt, registeredAt)))
    .orderBy(asc(acquisitionVisits.occurredAt));
  const first = visits[0];
  const last = visits.at(-1);
  if (!first || !last) return false;
  const inserted = await db
    .insert(userAcquisitionAttributions)
    .values({
      userId: input.userId,
      firstVisitId: first.id,
      lastVisitId: last.id,
      firstLinkId: first.linkId,
      lastLinkId: last.linkId,
      registeredAt
    })
    .onConflictDoNothing({ target: userAcquisitionAttributions.userId })
    .returning({ id: userAcquisitionAttributions.id });
  await db.update(acquisitionVisits).set({ userId: input.userId }).where(eq(acquisitionVisits.visitorId, visitor.id));
  return inserted.length > 0;
}
