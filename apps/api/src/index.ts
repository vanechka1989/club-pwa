import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { env } from "./env";
import { adminRoute } from "./routes/admin";
import { authRoute } from "./routes/auth";
import { communityRoute } from "./routes/community";
import { learningRoute } from "./routes/learning";
import { logger } from "./logger";
import { mailingsRoute, startMailingDispatcher } from "./routes/mailings";
import { mailingPreferencesRoute } from "./routes/mailingPreferences";
import { meRoute } from "./routes/me";
import { notificationsRoute } from "./routes/notifications";
import { startExpiredPendingPaymentOrderCleanup } from "./payments/orderCleanupJob";
import { paymentsRoute } from "./routes/payments";
import { pushRoute } from "./routes/push";
import { subscriptionsRoute } from "./routes/subscriptions";
import { supportRoute } from "./routes/support";
import { getLocalUploadResponse } from "./storage/localUploads";
import { recordServerError } from "./serverErrors";
import { buildClientErrorRecord, createClientErrorRateLimiter, parseClientErrorPayload } from "./clientErrors";
import { startCommunityMediaCleanupJob } from "./community/mediaCleanup";

const app = new Hono();
const clientErrorRateLimiter = createClientErrorRateLimiter({ maxEvents: 20, windowMs: 60 * 1000 });

function getClientErrorRateLimitKey(c: Context) {
  const forwardedFor = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || c.req.header("x-real-ip") || c.req.header("cf-connecting-ip") || c.req.header("user-agent") || "unknown";
}

startExpiredPendingPaymentOrderCleanup();
startMailingDispatcher();
startCommunityMediaCleanupJob();

app.use("*", async (c, next) => {
  const startedAt = performance.now();
  try {
    await next();
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
  }
  logger.info(
    {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt)
    },
    "request"
  );
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
app.get("/uploads/*", async (c) => {
  const uploadKey = c.req.path.replace(/^\/uploads\/+/, "");
  const response = await getLocalUploadResponse(uploadKey);
  if (!response) {
    return c.notFound();
  }

  return response;
});
app.route("/auth", authRoute);
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
app.route("/admin/mailings", mailingsRoute);
app.route("/admin", adminRoute);
app.route("/community", communityRoute);
app.route("/learning", learningRoute);
app.route("/notifications", notificationsRoute);
app.route("/payments", paymentsRoute);
app.route("/push", pushRoute);
app.route("/subscriptions", subscriptionsRoute);
app.route("/support", supportRoute);

export default {
  port: env.PORT,
  fetch: app.fetch
};
