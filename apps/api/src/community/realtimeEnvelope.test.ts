import { describe, expect, it } from "vitest";
import { decodeCommunityRealtimeEnvelope, encodeCommunityRealtimeEnvelope } from "./realtimeEnvelope";

describe("community realtime envelope", () => {
  it("round-trips a distributed event with its process origin", () => {
    const encoded = encodeCommunityRealtimeEnvelope({
      originId: "api-1",
      event: {
        id: "event-1",
        type: "community.changed",
        topicId: "topic-1",
        createdAt: "2026-07-16T12:00:00.000Z"
      }
    });

    expect(decodeCommunityRealtimeEnvelope(encoded)).toEqual({
      originId: "api-1",
      event: {
        id: "event-1",
        type: "community.changed",
        topicId: "topic-1",
        createdAt: "2026-07-16T12:00:00.000Z"
      }
    });
  });

  it("rejects malformed Redis messages", () => {
    expect(decodeCommunityRealtimeEnvelope("not-json")).toBeNull();
    expect(decodeCommunityRealtimeEnvelope(JSON.stringify({ originId: "api-1" }))).toBeNull();
  });
});
