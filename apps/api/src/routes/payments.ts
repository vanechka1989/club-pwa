import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";

export const paymentsRoute = new Hono<{ Variables: AuthVariables }>().use("*", telegramAuth).get("/plans", (c) => {
  return c.json({
    plans: [
      {
        id: "monthly",
        title: "Monthly membership",
        priceLabel: "TBD",
        periodLabel: "1 month",
        description: "Access to the private club, learning materials and member support."
      }
    ]
  });
});
