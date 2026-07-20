import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("retry failed mailing deliveries endpoint", () => {
  const route = readFileSync(resolve(__dirname, "../routes/mailings.ts"), "utf8");
  const serializer = readFileSync(resolve(__dirname, "./serialize.ts"), "utf8");
  const shared = readFileSync(resolve(__dirname, "../../../../packages/shared/src/index.ts"), "utf8");

  it("resets only failed recipients for a new manual retry cycle", () => {
    expect(route).toContain('.post("/:id/retry-failed"');
    expect(route).toContain('eq(adminMailingRecipients.status, "failed")');
    expect(route).toContain('status: "pending"');
    expect(route).toContain("attemptCount: 0");
    expect(route).toContain("nextAttemptAt: null");
    expect(route).toContain("lastAttemptAt: null");
    expect(route).toContain("error: null");
    expect(route).toContain("retryRows.length === 0");
    expect(route).toContain('action: "mailing.failed.retry"');
    expect(route).toContain("recalculateMailingDeliveryState(mailing.id");
  });

  it("serializes live pending and processing counts", () => {
    expect(shared).toContain("pendingCount: z.number().int().nonnegative()");
    expect(shared).toContain("processingCount: z.number().int().nonnegative()");
    expect(serializer).toContain("getMailingDeliveryCounts(mailing.id)");
    expect(serializer).toContain("pendingCount: deliveryCounts.pendingCount");
    expect(serializer).toContain("processingCount: deliveryCounts.processingCount");
  });
});
