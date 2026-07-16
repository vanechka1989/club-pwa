import { randomUUID } from "node:crypto";
import { publishCommunityRealtimeEnvelope, subscribeToCommunityRealtimeEnvelopes } from "./realtimeRedis";
import type { CommunityRealtimeEvent } from "./realtimeEnvelope";

export type { CommunityRealtimeEvent } from "./realtimeEnvelope";

type CommunityRealtimeListener = (event: CommunityRealtimeEvent) => void;

const listeners = new Set<CommunityRealtimeListener>();
const originId = randomUUID();

function notifyCommunityRealtimeListeners(event: CommunityRealtimeEvent) {
  for (const listener of listeners) listener(event);
}

subscribeToCommunityRealtimeEnvelopes((envelope) => {
  if (envelope.originId !== originId) notifyCommunityRealtimeListeners(envelope.event);
});

export function publishCommunityChange(topicId: string | null = null): CommunityRealtimeEvent {
  const event: CommunityRealtimeEvent = {
    id: randomUUID(),
    type: "community.changed",
    topicId,
    createdAt: new Date().toISOString()
  };

  notifyCommunityRealtimeListeners(event);
  publishCommunityRealtimeEnvelope({ originId, event });

  return event;
}

export function subscribeToCommunityChanges(listener: CommunityRealtimeListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getCommunityRealtimeSubscriberCount() {
  return listeners.size;
}
