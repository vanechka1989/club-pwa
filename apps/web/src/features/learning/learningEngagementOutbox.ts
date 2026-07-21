import type { LearningEngagementSnapshot } from "@club/shared";
import { saveLearningEngagement } from "@/api/client";

export type LearningEngagementOutboxEntry = { contentItemId: string; snapshot: LearningEngagementSnapshot };
const storageKey = "club-learning-engagement-outbox-v1";
let delivery = Promise.resolve();

export function mergeLearningEngagementOutbox(entries: LearningEngagementOutboxEntry[], next: LearningEngagementOutboxEntry) {
  const index = entries.findIndex((entry) => entry.contentItemId === next.contentItemId && entry.snapshot.sessionId === next.snapshot.sessionId);
  if (index < 0) return [...entries, next];
  const previous = entries[index]!;
  const merged: LearningEngagementOutboxEntry = {
    contentItemId: next.contentItemId,
    snapshot: {
      ...next.snapshot,
      activeSeconds: Math.max(previous.snapshot.activeSeconds, next.snapshot.activeSeconds),
      videoSeconds: Math.max(previous.snapshot.videoSeconds, next.snapshot.videoSeconds),
      playbackPositionSeconds: Math.max(previous.snapshot.playbackPositionSeconds, next.snapshot.playbackPositionSeconds),
      closed: previous.snapshot.closed || next.snapshot.closed
    }
  };
  return entries.map((entry, entryIndex) => entryIndex === index ? merged : entry);
}

export function removeDeliveredLearningEngagement(
  entries: LearningEngagementOutboxEntry[],
  delivered: LearningEngagementOutboxEntry
) {
  return entries.filter((entry) => {
    const sameSession = entry.contentItemId === delivered.contentItemId
      && entry.snapshot.sessionId === delivered.snapshot.sessionId;
    if (!sameSession) return true;
    return entry.snapshot.activeSeconds > delivered.snapshot.activeSeconds
      || entry.snapshot.videoSeconds > delivered.snapshot.videoSeconds
      || entry.snapshot.playbackPositionSeconds > delivered.snapshot.playbackPositionSeconds
      || (entry.snapshot.closed && !delivered.snapshot.closed);
  });
}

function readOutbox() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed as LearningEngagementOutboxEntry[] : [];
  } catch {
    return [];
  }
}

function writeOutbox(entries: LearningEngagementOutboxEntry[]) {
  try {
    if (entries.length) localStorage.setItem(storageKey, JSON.stringify(entries));
    else localStorage.removeItem(storageKey);
  } catch {
    // Storage can be unavailable in private browser modes; online delivery still works.
  }
}

async function flushOutbox() {
  let entries = readOutbox();
  while (entries.length) {
    const entry = entries[0]!;
    await saveLearningEngagement(entry.contentItemId, entry.snapshot, { keepalive: entry.snapshot.closed });
    entries = removeDeliveredLearningEngagement(readOutbox(), entry);
    writeOutbox(entries);
  }
}

export function sendLearningEngagementWithRetry(contentItemId: string, snapshot: LearningEngagementSnapshot) {
  writeOutbox(mergeLearningEngagementOutbox(readOutbox(), { contentItemId, snapshot }));
  delivery = delivery.then(flushOutbox, flushOutbox);
  return delivery;
}
