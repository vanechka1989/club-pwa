export type ReconciliationSummary = {
  checked: number;
  corrected: number;
  failed: number;
};

export async function runBoundedReconciliation<T>(
  items: T[],
  worker: (item: T) => Promise<"corrected" | "unchanged">,
  concurrency = 4
): Promise<ReconciliationSummary> {
  const summary: ReconciliationSummary = { checked: 0, corrected: 0, failed: 0 };
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item === undefined) return;
      summary.checked += 1;
      try {
        if (await worker(item) === "corrected") summary.corrected += 1;
      } catch {
        summary.failed += 1;
      }
    }
  });
  await Promise.all(runners);
  return summary;
}
