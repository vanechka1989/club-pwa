import { Hono } from "hono";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";

export const supportRoute = new Hono<{ Variables: AuthVariables }>().use("*", telegramAuth).get("/", (c) => {
  return c.json({
    managerContact: null,
    topics: [
      {
        id: "payment",
        title: "Payment",
        description: "Questions about subscription status, renewal or receipts."
      },
      {
        id: "access",
        title: "Access",
        description: "Help with opening lessons, videos or private materials."
      },
      {
        id: "other",
        title: "Other",
        description: "Anything that does not fit the standard topics."
      }
    ]
  });
});
