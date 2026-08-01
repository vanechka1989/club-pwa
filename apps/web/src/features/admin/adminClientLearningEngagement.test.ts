import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("client 360 learning engagement", () => {
  it("combines viewing time and assessment results in one learning section", () => {
    const panel = readFileSync(resolve(__dirname, "AdminClientsPanel.vue"), "utf8");
    const section = readFileSync(resolve(__dirname, "AdminClientLearningSection.vue"), "utf8");
    expect(panel).toContain("AdminClientLearningSection");
    expect(panel).toContain("selectedUserDetail?.learningEngagement");
    expect(panel).toContain("selectedUserDetail?.learningAssessments");
    expect(section).toContain("Тесты и ДЗ");
    expect(section).toContain("formatDuration(totalSeconds)");
  });
});
