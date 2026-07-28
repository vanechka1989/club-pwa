import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  createPersistentCommunityReadRateLimit,
  getCommunityReadRateLimitPolicy
} from "./persistentCommunityReadRateLimit";

describe("persistent community read rate limiting", () => {
  it("assigns separate reasonable policies only to search and context GETs", () => {
    expect(getCommunityReadRateLimitPolicy("GET", "/community/messages/search")).toEqual({
      scope: "search",
      limit: 30,
      windowMs: 60_000
    });
    expect(getCommunityReadRateLimitPolicy("GET", "/topics/a/messages/b/context")).toEqual({
      scope: "context",
      limit: 60,
      windowMs: 60_000
    });
    expect(getCommunityReadRateLimitPolicy("POST", "/community/messages/search")).toBeNull();
    expect(getCommunityReadRateLimitPolicy("GET", "/community/topics/a/messages")).toBeNull();
  });

  it("allows requests within allowance and returns 429 with Retry-After when exhausted", async () => {
    const consume = vi.fn()
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 17 });
    const app = new Hono<any>();
    app.use("*", async (c, next) => {
      c.set("userId", "00000000-0000-4000-8000-000000000001");
      await next();
    });
    app.use("*", createPersistentCommunityReadRateLimit(consume));
    app.get("/messages/search", (c) => c.json({ ok: true }));

    expect((await app.request("/messages/search")).status).toBe(200);
    const rejected = await app.request("/messages/search");

    expect(rejected.status).toBe(429);
    expect(rejected.headers.get("retry-after")).toBe("17");
    await expect(rejected.json()).resolves.toEqual({ error: "Too many requests", retryAfterSeconds: 17 });
    expect(consume).toHaveBeenNthCalledWith(
      1,
      "search",
      "00000000-0000-4000-8000-000000000001",
      30,
      60_000
    );
  });
});
