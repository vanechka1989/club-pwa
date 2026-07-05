import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "CommunitySection.vue"), "utf8");

describe("community archive labels", () => {
  it("shows when archived topics will be deleted", () => {
    expect(source).toContain("formatArchiveDeletionLabel(topic.archivedUntil)");
    expect(source).not.toContain("В архиве до {{ formatArchiveUntil");
  });

  it("keeps chat viewport sizing separate from the global app viewport", () => {
    expect(source).not.toContain("--club-viewport-height");
    expect(source).toContain("--club-chat-viewport-height");
    expect(source).toContain('document.body.classList.contains("club-ios")');
  });

  it("does not show a chat update alert for automatic polling failures", () => {
    expect(source).toContain("void refreshSelectedTopic({ silent: true });");
  });
});
