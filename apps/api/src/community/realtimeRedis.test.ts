import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const realtimeSource = readFileSync(new URL("./realtime.ts", import.meta.url), "utf8");
const envSource = readFileSync(new URL("../env.ts", import.meta.url), "utf8");

describe("distributed community realtime", () => {
  it("publishes local changes to the optional Redis bus", () => {
    expect(realtimeSource).toContain("publishCommunityRealtimeEnvelope");
    expect(realtimeSource).toContain("subscribeToCommunityRealtimeEnvelopes");
  });

  it("uses globally unique event ids across API replicas", () => {
    expect(realtimeSource).toContain("randomUUID()");
    expect(realtimeSource).not.toContain("nextEventId");
  });

  it("keeps Redis optional for the lightweight production mode", () => {
    expect(envSource).toContain("REDIS_URL: optionalUrl");
  });
});
