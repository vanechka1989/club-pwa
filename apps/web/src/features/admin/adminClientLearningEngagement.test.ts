import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("client 360 learning engagement", () => {
  it("opens the combined learning history as a dedicated client task", () => {
    const panel = readFileSync(resolve(__dirname, "AdminClientsPanel.vue"), "utf8");
    const section = readFileSync(resolve(__dirname, "AdminClientLearningSection.vue"), "utf8");
    const shell = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    expect(panel).toContain("open-learning");
    expect(shell).toContain("AdminClientLearningTask");
    expect(shell).toContain("/learning`");
    expect(shell).toContain("path.match(/^\\/admin\\/clients\\/([^/]+)\\/learning$/)");
    expect(section).toContain("Тесты и ДЗ");
    expect(section).toContain("formatDuration(totalSeconds)");
  });
});
