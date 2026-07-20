import { Hono } from "hono";
import { recordMailingTrackingEvent } from "../mailings/trackingEvents";
import { verifyMailingTrackingToken, type MailingTrackingPayload } from "../mailings/trackingToken";

const transparentGif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

type TrackingRecorder = typeof recordMailingTrackingEvent;

export function createMailingTrackingRoute(options: {
  record?: TrackingRecorder;
  secret?: string;
  onError?: (error: unknown) => void;
} = {}) {
  const route = new Hono();
  const record = options.record ?? recordMailingTrackingEvent;
  const onError = options.onError ?? ((error: unknown) => {
    void import("../logger")
      .then(({ logger }) => logger.warn({ error }, "Unable to record mailing tracking event"))
      .catch(() => undefined);
  });

  async function safelyRecord(input: Parameters<TrackingRecorder>[0]) {
    try {
      await record(input);
    } catch (error) {
      onError(error);
    }
  }

  function readToken(value: string, expectedPurpose: "click"): Extract<MailingTrackingPayload, { purpose: "click" }> | null;
  function readToken(value: string, expectedPurpose: "open" | "push"): Extract<MailingTrackingPayload, { purpose: "open" | "push" }> | null;
  function readToken(value: string, expectedPurpose: "open" | "click" | "push"): MailingTrackingPayload | null {
    try {
      const payload = verifyMailingTrackingToken(value, options.secret);
      return payload?.purpose === expectedPurpose ? payload : null;
    } catch {
      return null;
    }
  }

  route.get("/open", async (c) => {
    const payload = readToken(c.req.query("token") ?? "", "open");
    if (!payload) return c.notFound();
    await safelyRecord({ purpose: "open", recipientId: payload.recipientId });
    return c.body(transparentGif, 200, {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, private, max-age=0",
      "Content-Length": String(transparentGif.length)
    });
  });

  route.get("/click", async (c) => {
    const payload = readToken(c.req.query("token") ?? "", "click");
    if (!payload) return c.notFound();
    await safelyRecord({ purpose: "click", recipientId: payload.recipientId, destination: payload.destination });
    return c.redirect(payload.destination, 302);
  });

  route.get("/push", async (c) => {
    const payload = readToken(c.req.query("token") ?? "", "push");
    if (!payload) return c.notFound();
    await safelyRecord({ purpose: "push", recipientId: payload.recipientId });
    return c.redirect("/notifications", 302);
  });

  return route;
}

export const mailingTrackingRoute = createMailingTrackingRoute();
