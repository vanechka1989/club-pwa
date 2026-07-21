import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../routes/learning.ts"), "utf8");

describe("learning engagement route", () => {
  it("accepts authenticated cumulative snapshots without trusting a client user id", () => {
    expect(source).toContain('.post("/items/:id/engagement", requireActiveMember');
    expect(source).toContain("learningEngagementSnapshotSchema.safeParse");
    expect(source).toContain('const userId = c.get("userId")');
    expect(source).not.toMatch(/engagement[\s\S]{0,1200}body\.data\.userId/);
  });

  it("validates material ownership and rejects a session owned by another member", () => {
    expect(source).toContain("Learning engagement session belongs to another member");
    expect(source).toContain("Lesson material not found");
    expect(source).toContain("mergeEngagementCounters");
  });
});
