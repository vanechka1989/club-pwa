import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "LearningSection.vue"), "utf8");

describe("learning task screens", () => {
  it("opens module and lesson workflows as routed task screens", () => {
    expect(source).toContain('import TaskScreen from "@/features/app/TaskScreen.vue"');
    expect(source).toContain('openLearningTask("/learning/modules/new")');
    expect(source).toContain("openLearningTask(`/learning/modules/${module.id}/edit`)");
    expect(source).toContain("openLearningTask(`/learning/lessons/${lesson.id}`)");
    expect(source).toContain("<TaskScreen");
    expect(source).not.toContain('class="admin-modal-backdrop module-name-backdrop"');
    expect(source).not.toContain('class="admin-modal-backdrop lesson-preview-backdrop"');
  });
});
