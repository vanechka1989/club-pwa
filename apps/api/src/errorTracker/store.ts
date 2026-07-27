import { randomUUID } from "node:crypto";
import {
  classifyErrorSeverity,
  fingerprintErrorEvent,
  sanitizeErrorEvent,
  shouldNotifyIncident,
  type ErrorGroupStatus,
  type ErrorSeverity,
  type ErrorSource,
  type RawErrorEvent,
  type SanitizedErrorEvent
} from "./domain";

export type ErrorIdentity = { userId: string | null; installationId: string | null };

export type StoredErrorGroup = {
  id: string;
  fingerprint: string;
  title: string;
  source: ErrorSource;
  kind: string;
  severity: ErrorSeverity;
  status: ErrorGroupStatus;
  route: string | null;
  firstRelease: string | null;
  latestRelease: string | null;
  totalCount: number;
  affectedUsers: number;
  affectedDevices: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastNotifiedAt: Date | null;
  resolvedAt: Date | null;
  mutedUntil: Date | null;
};

export type RecordedError = { group: StoredErrorGroup; occurrenceId: string; shouldNotify: boolean };

export interface ErrorTrackerRepository {
  record(event: SanitizedErrorEvent, fingerprint: string, severity: ErrorSeverity, identity: ErrorIdentity): Promise<{ group: StoredErrorGroup; occurrenceId: string; recentCount: number; recentAffectedUsers: number }>;
  updateStatus(groupId: string, status: ErrorGroupStatus, now: Date): Promise<StoredErrorGroup | null>;
  markNotified(groupId: string, now: Date): Promise<void>;
}

export function createErrorTrackerStore(repository: ErrorTrackerRepository) {
  return {
    async record(input: RawErrorEvent, identity: ErrorIdentity): Promise<RecordedError> {
      const event = sanitizeErrorEvent(input);
      const fingerprint = fingerprintErrorEvent(event);
      const severity = classifyErrorSeverity(event);
      const recorded = await repository.record(event, fingerprint, severity, identity);
      const muted = recorded.group.mutedUntil && recorded.group.mutedUntil > event.occurredAt;
      const shouldNotify = recorded.group.status !== "ignored" && !muted && shouldNotifyIncident({
        severity: recorded.group.severity,
        count: recorded.recentCount,
        affectedUsers: recorded.recentAffectedUsers,
        now: event.occurredAt,
        lastNotifiedAt: recorded.group.lastNotifiedAt
      });
      return { ...recorded, shouldNotify };
    },
    updateStatus(groupId: string, status: ErrorGroupStatus, now = new Date()) {
      return repository.updateStatus(groupId, status, now);
    },
    markNotified(groupId: string, now = new Date()) {
      return repository.markNotified(groupId, now);
    }
  };
}

export function createInMemoryErrorTrackerRepository(): ErrorTrackerRepository {
  const groups = new Map<string, StoredErrorGroup>();
  const users = new Map<string, Set<string>>();
  const devices = new Map<string, Set<string>>();
  const occurrences = new Map<string, Array<{ occurredAt: Date; userId: string | null }>>();
  return {
    async record(event, fingerprint, severity, identity) {
      const existing = groups.get(fingerprint);
      const group = existing ?? {
        id: randomUUID(),
        fingerprint,
        title: event.title,
        source: event.source,
        kind: event.kind,
        severity,
        status: "new" as const,
        route: event.route,
        firstRelease: event.release,
        latestRelease: event.release,
        totalCount: 0,
        affectedUsers: 0,
        affectedDevices: 0,
        firstSeenAt: event.occurredAt,
        lastSeenAt: event.occurredAt,
        lastNotifiedAt: null,
        resolvedAt: null,
        mutedUntil: null
      };
      const groupUsers = users.get(group.id) ?? new Set<string>();
      const groupDevices = devices.get(group.id) ?? new Set<string>();
      if (identity.userId) groupUsers.add(identity.userId);
      if (identity.installationId) groupDevices.add(identity.installationId);
      users.set(group.id, groupUsers);
      devices.set(group.id, groupDevices);
      group.totalCount += 1;
      group.affectedUsers = groupUsers.size;
      group.affectedDevices = groupDevices.size;
      group.lastSeenAt = event.occurredAt;
      group.latestRelease = event.release;
      if (group.status === "resolved") {
        group.status = "new";
        group.resolvedAt = null;
      }
      groups.set(fingerprint, group);
      const groupOccurrences = occurrences.get(group.id) ?? [];
      groupOccurrences.push({ occurredAt: event.occurredAt, userId: identity.userId });
      occurrences.set(group.id, groupOccurrences);
      const since = event.occurredAt.getTime() - 10 * 60_000;
      const recent = groupOccurrences.filter((item) => item.occurredAt.getTime() >= since && item.occurredAt <= event.occurredAt);
      return {
        group: { ...group },
        occurrenceId: randomUUID(),
        recentCount: recent.length,
        recentAffectedUsers: new Set(recent.flatMap((item) => item.userId ? [item.userId] : [])).size
      };
    },
    async updateStatus(groupId, status, now) {
      const group = [...groups.values()].find((entry) => entry.id === groupId);
      if (!group) return null;
      group.status = status;
      group.resolvedAt = status === "resolved" ? now : null;
      return { ...group };
    },
    async markNotified(groupId, now) {
      const group = [...groups.values()].find((entry) => entry.id === groupId);
      if (group) group.lastNotifiedAt = now;
    }
  };
}
