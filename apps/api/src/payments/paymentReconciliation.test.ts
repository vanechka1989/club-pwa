import { describe, expect, it } from "vitest";
import { runBoundedReconciliation } from "./paymentReconciliationCore";

describe("payment reconciliation", () => {
  it("uses bounded concurrency and continues after a transient failure", async () => {
    let active = 0;
    let maxActive = 0;
    const summary = await runBoundedReconciliation([1, 2, 3, 4, 5], async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      if (item === 3) throw new Error("temporary");
      return item === 2 ? "corrected" : "unchanged";
    }, 2);

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(summary).toEqual({ checked: 5, corrected: 1, failed: 1 });
  });
});
