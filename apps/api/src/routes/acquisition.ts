import type { AcquisitionDestination } from "@club/shared";
import { acquisitionAidSchema } from "@club/shared";
import { Hono } from "hono";
import { z } from "zod";
import { createClientErrorRateLimiter } from "../clientErrors";

const visitSchema = z.object({
  aid: acquisitionAidSchema,
  visitorId: z.string().uuid()
});

type RecordVisit = (input: { aid: string; visitorId: string }) => Promise<{
  accepted: boolean;
  destination: AcquisitionDestination;
}>;

type ResolveRedirect = (aid: string) => Promise<string | null>;

export function createAcquisitionRoute(recordVisit: RecordVisit) {
  const limiter = createClientErrorRateLimiter({ maxEvents: 60, windowMs: 60_000 });
  return new Hono().post("/visit", async (c) => {
    const key = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    if (!limiter.consume(key)) return c.json({ accepted: false, destination: { kind: "home" } }, 429);
    const payload = visitSchema.safeParse(await c.req.json().catch(() => null));
    if (!payload.success) return c.json({ accepted: false, destination: { kind: "home" } }, 400);
    try {
      const result = await recordVisit(payload.data);
      return c.json({ accepted: result.accepted, destination: result.destination });
    } catch {
      return c.json({ accepted: false, destination: { kind: "home" } });
    }
  });
}

export function createAcquisitionRedirectRoute(resolveRedirect: ResolveRedirect) {
  return new Hono().get("/:aid", async (c) => {
    const aid = acquisitionAidSchema.safeParse(c.req.param("aid"));
    if (!aid.success) return c.notFound();
    const destination = await resolveRedirect(aid.data).catch(() => null);
    return destination ? c.redirect(destination, 302) : c.notFound();
  });
}
