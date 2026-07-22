import { completeLearningContent } from "@/api/client";

export type LearningCompletionOutboxEntry = { contentItemId: string };
const storageKey = "club-learning-completion-outbox-v1";
let delivery = Promise.resolve();

export function mergeLearningCompletionOutbox(entries: LearningCompletionOutboxEntry[], contentItemId: string) {
  return entries.some((entry) => entry.contentItemId === contentItemId)
    ? entries
    : [...entries, { contentItemId }];
}

export function removeDeliveredLearningCompletion(entries: LearningCompletionOutboxEntry[], contentItemId: string) {
  return entries.filter((entry) => entry.contentItemId !== contentItemId);
}

function readOutbox() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(parsed) ? parsed as LearningCompletionOutboxEntry[] : [];
  } catch {
    return [];
  }
}

function writeOutbox(entries: LearningCompletionOutboxEntry[]) {
  try {
    if (entries.length) localStorage.setItem(storageKey, JSON.stringify(entries));
    else localStorage.removeItem(storageKey);
  } catch {
    // Private browser modes may deny storage; immediate online delivery still runs.
  }
}

async function deliverOutbox() {
  let entries = readOutbox();
  while (entries.length) {
    const entry = entries[0]!;
    await completeLearningContent(entry.contentItemId, { keepalive: true });
    entries = removeDeliveredLearningCompletion(readOutbox(), entry.contentItemId);
    writeOutbox(entries);
  }
}

export function flushLearningCompletionOutbox() {
  delivery = delivery.then(deliverOutbox, deliverOutbox);
  return delivery;
}

export function queueLearningCompletion(contentItemId: string) {
  writeOutbox(mergeLearningCompletionOutbox(readOutbox(), contentItemId));
  return flushLearningCompletionOutbox();
}
