export type CommunityRealtimeEvent = {
  id: string;
  type: "community.changed";
  topicId: string | null;
  createdAt: string;
};

export type CommunityRealtimeEnvelope = {
  originId: string;
  event: CommunityRealtimeEvent;
};

export function encodeCommunityRealtimeEnvelope(envelope: CommunityRealtimeEnvelope) {
  return JSON.stringify(envelope);
}

export function decodeCommunityRealtimeEnvelope(value: string): CommunityRealtimeEnvelope | null {
  try {
    const parsed = JSON.parse(value) as Partial<CommunityRealtimeEnvelope>;
    const event = parsed.event;
    if (
      typeof parsed.originId !== "string" ||
      !event ||
      typeof event.id !== "string" ||
      event.type !== "community.changed" ||
      (event.topicId !== null && typeof event.topicId !== "string") ||
      typeof event.createdAt !== "string"
    ) {
      return null;
    }

    return { originId: parsed.originId, event };
  } catch {
    return null;
  }
}
