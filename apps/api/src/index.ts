import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env";
import { adminRoute } from "./routes/admin";
import { communityRoute } from "./routes/community";
import { learningRoute } from "./routes/learning";
import { logger } from "./logger";
import { meRoute } from "./routes/me";
import { startExpiredPendingPaymentOrderCleanup } from "./payments/orderCleanupJob";
import { paymentsRoute } from "./routes/payments";
import { subscriptionsRoute } from "./routes/subscriptions";
import { supportRoute } from "./routes/support";
import { telegramRoute } from "./routes/telegram";
import { setTelegramWebhook, telegramWebhookAllowedUpdates } from "./telegram/webhook";

const app = new Hono();

startExpiredPendingPaymentOrderCleanup();

if (env.NODE_ENV === "production") {
  const telegramWebhookOptions: Parameters<typeof setTelegramWebhook>[0] = {
    token: env.TELEGRAM_BOT_TOKEN,
    webOrigin: env.WEB_ORIGIN
  };
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    telegramWebhookOptions.secretToken = env.TELEGRAM_WEBHOOK_SECRET;
  }

  void setTelegramWebhook(telegramWebhookOptions)
    .then(() => {
      logger.info(
        {
          allowedUpdates: telegramWebhookAllowedUpdates
        },
        "telegram webhook configured"
      );
    })
    .catch((error) => {
      logger.error({ error }, "telegram webhook configuration failed");
    });
}

app.use("*", async (c, next) => {
  const startedAt = performance.now();
  await next();
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
    allowHeaders: ["Authorization", "Content-Type", "X-Dev-Telegram-User"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"]
  })
);

app.get("/health", (c) => c.json({ ok: true }));

app.route("/me", meRoute);
app.route("/admin", adminRoute);
app.route("/community", communityRoute);
app.route("/learning", learningRoute);
app.route("/payments", paymentsRoute);
app.route("/subscriptions", subscriptionsRoute);
app.route("/support", supportRoute);
app.route("/telegram", telegramRoute);

export default {
  port: env.PORT,
  fetch: app.fetch
};
