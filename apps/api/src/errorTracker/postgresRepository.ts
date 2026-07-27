import { and, count, countDistinct, desc, eq, gte, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { errorGroups, errorNotificationDeliveries, errorOccurrences } from "../db/schema";
import type { ErrorGroupStatus, ErrorSeverity, ErrorSource, SanitizedErrorEvent } from "./domain";
import type { ErrorIdentity, ErrorTrackerRepository, StoredErrorGroup } from "./store";

function mapGroup(row: typeof errorGroups.$inferSelect): StoredErrorGroup {
  return {
    ...row,
    source: row.source as ErrorSource,
    severity: row.severity as ErrorSeverity,
    status: row.status as ErrorGroupStatus
  };
}

export const postgresErrorTrackerRepository: ErrorTrackerRepository = {
  async record(event: SanitizedErrorEvent, fingerprint: string, severity: ErrorSeverity, identity: ErrorIdentity) {
    return db.transaction(async (tx) => {
      const [upserted] = await tx
        .insert(errorGroups)
        .values({
          fingerprint,
          title: event.title,
          source: event.source,
          kind: event.kind,
          severity,
          status: "new",
          route: event.route,
          firstRelease: event.release,
          latestRelease: event.release,
          totalCount: 1,
          firstSeenAt: event.occurredAt,
          lastSeenAt: event.occurredAt,
          updatedAt: event.occurredAt
        })
        .onConflictDoUpdate({
          target: errorGroups.fingerprint,
          set: {
            title: event.title,
            route: event.route,
            latestRelease: event.release,
            totalCount: sql`${errorGroups.totalCount} + 1`,
            severity: sql`case
              when ${errorGroups.severity} = 'critical' or ${severity} = 'critical' then 'critical'
              when ${errorGroups.severity} = 'error' or ${severity} = 'error' then 'error'
              else 'warning'
            end`,
            status: sql`case when ${errorGroups.status} = 'resolved' then 'new' else ${errorGroups.status} end`,
            resolvedAt: sql`case when ${errorGroups.status} = 'resolved' then null else ${errorGroups.resolvedAt} end`,
            lastSeenAt: event.occurredAt,
            updatedAt: event.occurredAt
          }
        })
        .returning();
      if (!upserted) throw new Error("Error group was not saved");

      const [occurrence] = await tx
        .insert(errorOccurrences)
        .values({
          groupId: upserted.id,
          userId: identity.userId,
          installationId: identity.installationId ?? event.installationId,
          message: event.message,
          stack: event.stack,
          route: event.route,
          method: event.method,
          httpStatus: event.status,
          release: event.release,
          platform: event.platform,
          userAgent: event.userAgent,
          context: {
            detail: event.detail,
            viewport: event.viewport ?? null,
            displayMode: event.displayMode ?? null,
            online: event.online ?? null
          },
          occurredAt: event.occurredAt
        })
        .returning({ id: errorOccurrences.id });
      if (!occurrence) throw new Error("Error occurrence was not saved");

      const [impact] = await tx
        .select({
          affectedUsers: countDistinct(errorOccurrences.userId),
          affectedDevices: countDistinct(errorOccurrences.installationId)
        })
        .from(errorOccurrences)
        .where(eq(errorOccurrences.groupId, upserted.id));
      const notificationWindowStart = new Date(event.occurredAt.getTime() - 10 * 60_000);
      const [recentImpact] = await tx
        .select({ affectedUsers: countDistinct(errorOccurrences.userId), occurrences: count() })
        .from(errorOccurrences)
        .where(and(eq(errorOccurrences.groupId, upserted.id), gte(errorOccurrences.occurredAt, notificationWindowStart)));
      const [updated] = await tx
        .update(errorGroups)
        .set({
          affectedUsers: Number(impact?.affectedUsers ?? 0),
          affectedDevices: Number(impact?.affectedDevices ?? 0)
        })
        .where(eq(errorGroups.id, upserted.id))
        .returning();
      return {
        group: mapGroup(updated ?? upserted),
        occurrenceId: occurrence.id,
        recentCount: Number(recentImpact?.occurrences ?? 0),
        recentAffectedUsers: Number(recentImpact?.affectedUsers ?? 0)
      };
    });
  },
  async updateStatus(groupId, status, now) {
    const [updated] = await db
      .update(errorGroups)
      .set({ status, resolvedAt: status === "resolved" ? now : null, updatedAt: now })
      .where(eq(errorGroups.id, groupId))
      .returning();
    return updated ? mapGroup(updated) : null;
  },
  async markNotified(groupId, now) {
    await db.update(errorGroups).set({ lastNotifiedAt: now, updatedAt: now }).where(eq(errorGroups.id, groupId));
  }
};

export type ErrorGroupFilters = {
  status?: ErrorGroupStatus;
  severity?: ErrorSeverity;
  source?: ErrorSource;
  route?: string;
  cursor?: Date;
  limit?: number;
};

export async function listPersistedErrorGroups(filters: ErrorGroupFilters = {}) {
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(errorGroups.status, filters.status));
  if (filters.severity) conditions.push(eq(errorGroups.severity, filters.severity));
  if (filters.source) conditions.push(eq(errorGroups.source, filters.source));
  if (filters.route) conditions.push(eq(errorGroups.route, filters.route));
  if (filters.cursor) conditions.push(lt(errorGroups.lastSeenAt, filters.cursor));
  const requestedLimit = Number.isFinite(filters.limit) ? filters.limit! : 30;
  const limit = Math.min(100, Math.max(1, Math.trunc(requestedLimit)));
  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, totalResult] = await Promise.all([
    db.select().from(errorGroups).where(where).orderBy(desc(errorGroups.lastSeenAt)).limit(limit + 1),
    db.select({ value: count() }).from(errorGroups).where(where)
  ]);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    groups: page.map(mapGroup),
    total: Number(totalResult[0]?.value ?? 0),
    nextCursor: hasMore ? page.at(-1)?.lastSeenAt.toISOString() ?? null : null
  };
}

export async function getPersistedErrorGroup(groupId: string) {
  const group = await db.query.errorGroups.findFirst({ where: eq(errorGroups.id, groupId) });
  if (!group) return null;
  const [occurrences, deliveries] = await Promise.all([
    db.select().from(errorOccurrences).where(eq(errorOccurrences.groupId, groupId)).orderBy(desc(errorOccurrences.occurredAt)).limit(50),
    db.select().from(errorNotificationDeliveries).where(eq(errorNotificationDeliveries.groupId, groupId)).orderBy(desc(errorNotificationDeliveries.createdAt)).limit(30)
  ]);
  return { group: mapGroup(group), occurrences, deliveries };
}

export async function getPersistedErrorSummary(now = new Date()) {
  const since = new Date(now.getTime() - 24 * 60 * 60_000);
  const [critical, active, impact] = await Promise.all([
    db.select({ value: count() }).from(errorGroups).where(and(eq(errorGroups.status, "new"), eq(errorGroups.severity, "critical"))),
    db.select({ value: count() }).from(errorGroups).where(inArray(errorGroups.status, ["new", "acknowledged"])),
    db.select({ users: countDistinct(errorOccurrences.userId), occurrences: count() }).from(errorOccurrences).where(gte(errorOccurrences.occurredAt, since))
  ]);
  return {
    newCritical: Number(critical[0]?.value ?? 0),
    activeGroups: Number(active[0]?.value ?? 0),
    affectedUsers24h: Number(impact[0]?.users ?? 0),
    occurrences24h: Number(impact[0]?.occurrences ?? 0)
  };
}

export async function prunePersistedErrors(now = new Date()) {
  const occurrencesBefore = new Date(now.getTime() - 14 * 24 * 60 * 60_000);
  const deliveriesBefore = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const groupsBefore = new Date(now.getTime() - 90 * 24 * 60 * 60_000);
  await db.delete(errorOccurrences).where(lt(errorOccurrences.occurredAt, occurrencesBefore));
  await db.delete(errorNotificationDeliveries).where(lt(errorNotificationDeliveries.createdAt, deliveriesBefore));
  await db.delete(errorGroups).where(and(lt(errorGroups.lastSeenAt, groupsBefore), ne(errorGroups.status, "new"), ne(errorGroups.status, "acknowledged")));
}
