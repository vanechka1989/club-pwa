export type CommunityRealtimeEvent = {
  id: string;
  type: "community.changed";
  topicId: string | null;
  createdAt: string;
};

type CommunityRealtimeListener = (event: CommunityRealtimeEvent) => void;

const listeners = new Set<CommunityRealtimeListener>();
let nextEventId = 0;

export function publishCommunityChange(topicId: string | null = null): CommunityRealtimeEvent {
  const event: CommunityRealtimeEvent = {
    id: String(++nextEventId),
    type: "community.changed",
    topicId,
    createdAt: new Date().toISOString()
  };

  for (const listener of listeners) {
    listener(event);
  }

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
