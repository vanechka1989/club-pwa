import type { MiddlewareHandler } from "hono";
import type { AuthVariables } from "./auth";
import { getMembership } from "../membership/getMembership";

export const requireActiveMember: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const previewMembershipStatus = c.get("previewMembershipStatus");
  if (previewMembershipStatus === "active") {
    await next();
    return;
  }

  if (previewMembershipStatus === "inactive") {
    return c.json(
      {
        error: "Active membership is required",
        membershipStatus: "inactive"
      },
      403
    );
  }

  const membership = await getMembership(c.get("userId"));

  if (!membership.isActive) {
    return c.json(
      {
        error: "Active membership is required",
        membershipStatus: membership.status
      },
      403
    );
  }

  await next();
};
