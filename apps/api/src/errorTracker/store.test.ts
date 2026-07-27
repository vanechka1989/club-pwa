import { describe, expect, it } from "vitest";
import { createErrorTrackerStore, createInMemoryErrorTrackerRepository } from "./store";

describe("error tracker store", () => {
  it("groups repeated events and counts unique affected users and devices", async () => {
    const store = createErrorTrackerStore(createInMemoryErrorTrackerRepository());
    const event = { source: "client" as const, kind: "window-error", message: "Render failed", route: "/modules" };

    const first = await store.record(event, { userId: "4d914956-c82e-4b61-9f20-a37866613aa1", installationId: "phone" });
    const second = await store.record(event, { userId: "4d914956-c82e-4b61-9f20-a37866613aa1", installationId: "phone" });
    const third = await store.record(event, { userId: "8cf407de-1352-4d46-8122-f13a4ce42a26", installationId: "tablet" });

    expect(second.group.id).toBe(first.group.id);
    expect(third.group.totalCount).toBe(3);
    expect(third.group.affectedUsers).toBe(2);
    expect(third.group.affectedDevices).toBe(2);
    expect(third.shouldNotify).toBe(true);
  });

  it("reopens a resolved group on the next occurrence", async () => {
    const store = createErrorTrackerStore(createInMemoryErrorTrackerRepository());
    const event = { source: "api" as const, kind: "request-error", message: "Database failed", route: "/learning" };
    const first = await store.record(event, { userId: null, installationId: null });
    await store.updateStatus(first.group.id, "resolved");

    const reopened = await store.record(event, { userId: null, installationId: null });
    expect(reopened.group.status).toBe("new");
    expect(reopened.group.resolvedAt).toBeNull();
  });

  it("does not notify ignored or currently muted groups", async () => {
    const store = createErrorTrackerStore(createInMemoryErrorTrackerRepository());
    const event = { source: "client" as const, kind: "blank-screen", message: "App did not mount" };
    const first = await store.record(event, { userId: null, installationId: null });
    await store.updateStatus(first.group.id, "ignored");
    const ignored = await store.record(event, { userId: null, installationId: null });
    expect(ignored.shouldNotify).toBe(false);
  });

  it("applies non-critical thresholds only inside the ten-minute window", async () => {
    const store = createErrorTrackerStore(createInMemoryErrorTrackerRepository());
    const base = { source: "api" as const, kind: "request-error", message: "Rendering failed", route: "/modules" };
    await store.record({ ...base, occurredAt: new Date("2026-07-26T10:00:00.000Z") }, { userId: null, installationId: null });
    await store.record({ ...base, occurredAt: new Date("2026-07-26T10:01:00.000Z") }, { userId: null, installationId: null });
    const current = await store.record({ ...base, occurredAt: new Date("2026-07-27T10:00:00.000Z") }, { userId: null, installationId: null });
    expect(current.group.totalCount).toBe(3);
    expect(current.shouldNotify).toBe(false);
  });
});
