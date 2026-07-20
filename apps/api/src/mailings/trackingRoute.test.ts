import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createMailingTrackingRoute } from "../routes/mailingTracking";
import { createMailingTrackingToken } from "./trackingToken";

describe("public mailing tracking route", () => {
  const secret = "tracking-route-secret";
  const recipientId = "9cf746ce-65af-4aa0-b0c1-3d18adb63e31";

  function appWith(record = vi.fn(async () => true)) {
    const app = new Hono();
    app.route("/mailings/track", createMailingTrackingRoute({ record, secret }));
    return { app, record };
  }

  it("returns 404 for an invalid token", async () => {
    const { app, record } = appWith();
    const response = await app.request("/mailings/track/open?token=invalid");
    expect(response.status).toBe(404);
    expect(record).not.toHaveBeenCalled();
  });

  it("records an open and returns a non-cacheable transparent gif", async () => {
    const { app, record } = appWith();
    const token = createMailingTrackingToken({ purpose: "open", recipientId }, secret);
    const response = await app.request(`/mailings/track/open?token=${encodeURIComponent(token)}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/gif");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(record).toHaveBeenCalledWith({ purpose: "open", recipientId });
  });

  it("records a click and redirects only to its signed destination", async () => {
    const { app, record } = appWith();
    const destination = "https://example.com/report";
    const token = createMailingTrackingToken({ purpose: "click", recipientId, destination }, secret);
    const response = await app.request(`/mailings/track/click?token=${encodeURIComponent(token)}`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(destination);
    expect(record).toHaveBeenCalledWith({ purpose: "click", recipientId, destination });
  });

  it("redirects a push open to the notification center even when recording fails", async () => {
    const { app } = appWith(vi.fn(async () => { throw new Error("database unavailable"); }));
    const token = createMailingTrackingToken({ purpose: "push", recipientId }, secret);
    const response = await app.request(`/mailings/track/push?token=${encodeURIComponent(token)}`);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/notifications");
  });
});
