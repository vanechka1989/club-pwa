import { describe, expect, it } from "vitest";
import { collectReadiness } from "./readiness";

describe("collectReadiness", () => {
  it("reports ready when PostgreSQL is reachable and Redis is optional", async () => {
    await expect(collectReadiness({
      checkDatabase: async () => true,
      checkSchema: async () => true,
      checkRedis: async () => ({ configured: false, ready: true })
    })).resolves.toEqual({ ok: true, database: true, schema: true, redis: { configured: false, ready: true } });
  });

  it("reports not ready when a configured dependency is unavailable", async () => {
    await expect(collectReadiness({
      checkDatabase: async () => true,
      checkSchema: async () => true,
      checkRedis: async () => ({ configured: true, ready: false })
    })).resolves.toEqual({ ok: false, database: true, schema: true, redis: { configured: true, ready: false } });
  });

  it("fails readiness when the candidate schema capability is absent or partial", async () => {
    await expect(collectReadiness({
      checkDatabase: async () => true,
      checkSchema: async () => false,
      checkRedis: async () => ({ configured: false, ready: true })
    })).resolves.toEqual({ ok: false, database: true, schema: false, redis: { configured: false, ready: true } });
  });
});
