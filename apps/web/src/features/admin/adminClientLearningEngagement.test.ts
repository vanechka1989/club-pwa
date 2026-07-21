import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("client 360 learning engagement", () => {
  it("shows per-card viewing time in the client card", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    expect(source).toContain("Просмотры обучения");
    expect(source).toContain("selectedUserDetail?.learningEngagement");
    expect(source).toContain("formatLearningEngagementDuration");
  });
});
