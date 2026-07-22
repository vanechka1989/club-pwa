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
  });
});
