import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { shouldRunBackgroundJobs } from "./backgroundJobs";

describe("background jobs runtime role", () => {
  it("keeps jobs enabled for the current single API mode", () => {
    expect(shouldRunBackgroundJobs(undefined)).toBe(true);
  });

  it("allows stateless API replicas to disable jobs", () => {
    expect(shouldRunBackgroundJobs("false")).toBe(false);
    expect(shouldRunBackgroundJobs("true")).toBe(true);
  });

  it("starts jobs through one guarded entry point", () => {
    const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(source).toContain("startBackgroundJobs()");
    expect(source).not.toContain("startMailingDispatcher();");
    expect(source).toContain("server.stop(false)");
    expect(source).toContain('process.once("SIGTERM"');
    const jobs = readFileSync(new URL("./backgroundJobs.ts", import.meta.url), "utf8");
    expect(jobs).toContain("startPaymentReconciliationJob");
    expect(jobs).toContain("clearInterval(paymentReconciliationTimer)");
    expect(jobs).toContain("startDeletedMessageCleanupJob");
    expect(jobs).toContain("await deletedMessageCleanupJob.stop()");
    expect(jobs).toContain("startCommunityDocumentScannerJob");
    expect(jobs).toContain("await communityDocumentScannerJob.stop()");
    expect(jobs.indexOf("clearInterval(paymentReconciliationTimer)")).toBeLessThan(
      jobs.indexOf("await deletedMessageCleanupJob.stop()")
    );
    expect(source).toContain("await stopBackgroundJobs?.()");
    expect(source.indexOf("const forceTimer = setTimeout")).toBeLessThan(source.indexOf("await stopBackgroundJobs?.()"));
  });
});
