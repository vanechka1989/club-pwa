import { describe, expect, it } from "vitest";
import { hasObservabilityAccess } from "./observability";

describe("observability endpoint access", () => {
  it("stays private when no server token is configured", () => {
    expect(hasObservabilityAccess(new Request("https://club.example/metrics"), undefined)).toBe(false);
  });

  it("accepts only the configured bearer or dedicated header token", () => {
    expect(
      hasObservabilityAccess(
        new Request("https://club.example/metrics", { headers: { authorization: "Bearer monitor-secret" } }),
        "monitor-secret"
      )
    ).toBe(true);
    expect(
      hasObservabilityAccess(
        new Request("https://club.example/metrics", { headers: { "x-observability-token": "monitor-secret" } }),
        "monitor-secret"
      )
    ).toBe(true);
    expect(
      hasObservabilityAccess(
        new Request("https://club.example/metrics", { headers: { authorization: "Bearer wrong" } }),
        "monitor-secret"
      )
    ).toBe(false);
  });
});
