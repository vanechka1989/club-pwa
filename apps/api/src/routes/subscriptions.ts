import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";

export const subscriptionsRoute = new Hono<{ Variables: AuthVariables }>().use("*", telegramAuth).post("/checkout", (c) => {
  return c.json({
    checkoutUrl: null,
    message: "Payment provider is not configured yet. Wire YooKassa, Stripe, Prodamus or a manual approval flow here."
  });
});
