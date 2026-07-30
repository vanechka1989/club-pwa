import { describe, expect, it } from "vitest";
import { collectReadiness } from "./readiness";

describe("collectReadiness", () => {
  it("reports ready when PostgreSQL is reachable and Redis is optional", async () => {
    await expect(collectReadiness({
      checkDatabase: async () => true,
      checkRedis: async () => ({ configured: false, ready: true })
    })).resolves.toEqual({ ok: true, database: true, redis: { configured: false, ready: true } });
  });

  it("reports not ready when a configured dependency is unavailable", async () => {
    await expect(collectReadiness({
      checkDatabase: async () => true,
      checkRedis: async () => ({ configured: true, ready: false })
    })).resolves.toEqual({ ok: false, database: true, redis: { configured: true, ready: false } });
  });
});
