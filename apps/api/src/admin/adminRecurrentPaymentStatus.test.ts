import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin recurrent payment status", () => {
  it("serializes the latest recurrent status with one batch query for the client list", () => {
    const route = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");
    const shared = readFileSync(resolve(__dirname, "../../../../packages/shared/src/index.ts"), "utf8");

    expect(shared).toContain('recurrentPaymentStatus: z.enum(["active", "cancelled"]).nullable().optional()');
    expect(route).toContain("getLatestRecurrentPaymentStatuses");
    expect(route).toContain("inArray(userRecurrentSubscriptions.userId, userIds)");
    expect(route).toContain("orderBy: [desc(userRecurrentSubscriptions.updatedAt)]");
    expect(route).toContain("recurrentPaymentStatus:");
    expect(route).toContain("recurrentPaymentStatusByUserId");
  });
});
