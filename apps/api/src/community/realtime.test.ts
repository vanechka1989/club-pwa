import { describe, expect, it } from "vitest";
import {
  getCommunityRealtimeSubscriberCount,
  publishCommunityChange,
  subscribeToCommunityChanges
} from "./realtime";

describe("community realtime hub", () => {
  it("publishes ordered invalidation events and removes subscribers", () => {
    const events: ReturnType<typeof publishCommunityChange>[] = [];
    const unsubscribe = subscribeToCommunityChanges((event) => events.push(event));

    const first = publishCommunityChange("topic-1");
    unsubscribe();
    publishCommunityChange("topic-2");

    expect(events).toEqual([first]);
    expect(first).toMatchObject({
      type: "community.changed",
      topicId: "topic-1"
    });
    expect(first.id).toBeTypeOf("string");
    expect(first.createdAt).toBeTypeOf("string");
    expect(getCommunityRealtimeSubscriberCount()).toBe(0);
  });

  it("returns an idempotent unsubscribe function", () => {
    const unsubscribe = subscribeToCommunityChanges(() => undefined);

    expect(getCommunityRealtimeSubscriberCount()).toBe(1);
    unsubscribe();
    unsubscribe();

    expect(getCommunityRealtimeSubscriberCount()).toBe(0);
  });
});
