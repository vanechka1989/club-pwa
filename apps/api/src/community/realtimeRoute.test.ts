import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(resolve(__dirname, "../routes/community.ts"), "utf8");
const authSource = readFileSync(resolve(__dirname, "../middleware/auth.ts"), "utf8");
const adminSource = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");

describe("community realtime route", () => {
  it("streams authenticated community invalidations and cleans up subscribers", () => {
    expect(routeSource).toContain('from "hono/streaming"');
    expect(routeSource).toContain('.get("/events"');
    expect(routeSource).toContain("ensureCommunityAccess(c, role)");
    expect(routeSource).toContain("subscribeToCommunityChanges");
    expect(routeSource).toContain('event: "community.changed"');
    expect(routeSource).toContain('event: "heartbeat"');
    expect(routeSource).toContain("stream.onAbort");
    expect(routeSource).toContain("unsubscribe()");
  });

  it("publishes only after successful community mutations", () => {
    expect(routeSource).toContain("communityMutationMethods.has(c.req.method)");
    expect(routeSource).toContain("c.res.status < 400");
    expect(routeSource).toContain("publishCommunityChange");
    expect(adminSource).toContain('if (kind === "chat_message")');
    expect(adminSource).toContain("publishCommunityChange(message.topicId)");
  });

  it("allows native EventSource only on the cookie-authenticated stream route", () => {
    expect(authSource).toContain('c.req.path === "/community/events"');
    expect(authSource).toContain('c.req.query("pwa") === "1"');
    expect(authSource).toContain("hasPwaStandaloneAuthHeader");
  });
});
