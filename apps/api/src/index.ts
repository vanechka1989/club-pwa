import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { env } from "./env";
import { adminRoute } from "./routes/admin";
import { appStateRoute } from "./routes/appState";
import { authRoute } from "./routes/auth";
import { createAcquisitionRedirectRoute, createAcquisitionRoute } from "./routes/acquisition";
import { recordAcquisitionVisit, resolveAcquisitionRedirectUrl } from "./acquisition/acquisitionStore";
import { communityRoute } from "./routes/community";
import { learningRoute } from "./routes/learning";
import { logger } from "./logger";
import { mailingsRoute } from "./routes/mailings";
import { mailingPreferencesRoute } from "./routes/mailingPreferences";
import { mailingTrackingRoute } from "./routes/mailingTracking";
import { meRoute } from "./routes/me";
import { notificationsRoute } from "./routes/notifications";
import { paymentsRoute } from "./routes/payments";
import { pushRoute } from "./routes/push";
import { subscriptionsRoute } from "./routes/subscriptions";
import { supportRoute } from "./routes/support";
import { getLocalUploadResponse } from "./storage/localUploads";
import { recordServerError } from "./serverErrors";
import { buildClientErrorRecord, createClientErrorRateLimiter, parseClientErrorPayload } from "./clientErrors";
import { startBackgroundJobs } from "./backgroundJobs";
import { checkApplicationReadiness } from "./readiness";
import { requestMetrics } from "./requestMetrics";
import { getCommunityRealtimeSubscriberCount } from "./community/realtime";
import { hasObservabilityAccess } from "./observability";

const app = new Hono();
const clientErrorRateLimiter = createClientErrorRateLimiter({ maxEvents: 20, windowMs: 60 * 1000 });

function getClientErrorRateLimitKey(c: Context) {
  const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || c.req.header("x-real-ip") || c.req.header("cf-connecting-ip") || c.req.header("user-agent") || "unknown";
}

app.use("*", async (c, next) => {
  const startedAt = performance.now();
  let requestStatus = 500;
  try {
    await next();
    requestStatus = c.res.status;
  } catch (error) {
    recordServerError({
      error,
      title: "API упал при обработке запроса",
      method: c.req.method,
      path: c.req.path,
      status: 500
    });
    logger.error({ error, method: c.req.method, path: c.req.path }, "request failed");
    throw error;
  } finally {
    const durationMs = Math.round(performance.now() - startedAt);
    requestMetrics.record(requestStatus, durationMs);
    logger.info(
      {
        method: c.req.method,
        path: c.req.path,
        status: requestStatus,
        durationMs
      },
      "request"
    );
  }
});
app.use(
  "*",
  cors({
    origin: env.WEB_ORIGIN,
    allowHeaders: ["Content-Type", "X-Club-Preview-Mode", "X-Club-PWA-Standalone"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  })
);

app.get("/health", (c) => c.json({ ok: true }));
app.get("/ready", async (c) => {
  const readiness = await checkApplicationReadiness();
  return c.json({ ok: readiness.ok }, readiness.ok ? 200 : 503);
});
app.get("/metrics", (c) => {
  if (!hasObservabilityAccess(c.req.raw, env.OBSERVABILITY_TOKEN)) return c.notFound();
  return c.json({
    request: requestMetrics.snapshot(),
    realtimeSubscribers: getCommunityRealtimeSubscriberCount(),
    memoryRssBytes: process.memoryUsage().rss,
    uptimeSeconds: Math.round(process.uptime())
  });
});
app.get("/uploads/*", async (c) => {
  const uploadKey = c.req.path.replace(/^\/uploads\/+/, "");
  const response = await getLocalUploadResponse(uploadKey);
  if (!response) {
    return c.notFound();
  }

  return response;
});
app.route("/auth", authRoute);
app.route("/analytics/acquisition", createAcquisitionRoute(recordAcquisitionVisit));
app.route("/go", createAcquisitionRedirectRoute(resolveAcquisitionRedirectUrl));
app.route("/mailings/track", mailingTrackingRoute);
app.route("/mailings", mailingPreferencesRoute);

app.post("/client-errors", async (c) => {
  if (!clientErrorRateLimiter.consume(getClientErrorRateLimitKey(c))) {
    return c.json({ ok: false }, 429);
  }

  const body = parseClientErrorPayload(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ ok: false }, 400);
  }

  const record = buildClientErrorRecord(body.data);
  recordServerError(record);
  logger.warn(
    {
      kind: body.data.kind,
      message: body.data.message,
      url: body.data.url,
      platform: body.data.platform,
      userAgent: body.data.userAgent
    },
    "client application error"
  );

  return c.json({ ok: true });
});

app.route("/me", meRoute);
app.route("/app-state", appStateRoute);
app.route("/admin/mailings", mailingsRoute);
app.route("/admin", adminRoute);
app.route("/community", communityRoute);
app.route("/learning", learningRoute);
app.route("/notifications", notificationsRoute);
app.route("/payments", paymentsRoute);
app.route("/push", pushRoute);
app.route("/subscriptions", subscriptionsRoute);
app.route("/support", supportRoute);

const server = Bun.serve({
  port: env.PORT,
  idleTimeout: 120,
  fetch: app.fetch
});

let stopBackgroundJobs: (() => void) | null = null;
let shutdownRequested = false;
void startBackgroundJobs()
  .then((stop) => {
    if (!stop) return;
    if (shutdownRequested) stop();
    else stopBackgroundJobs = stop;
  })
  .catch((error) => logger.error({ error }, "Unable to start background jobs"));

async function shutdown(signal: string) {
  if (shutdownRequested) return;
  shutdownRequested = true;
  logger.info({ signal }, "graceful shutdown started");
  stopBackgroundJobs?.();
  stopBackgroundJobs = null;
  const forceTimer = setTimeout(() => process.exit(1), 25_000);
  forceTimer.unref();
  await server.stop(false);
  clearTimeout(forceTimer);
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
