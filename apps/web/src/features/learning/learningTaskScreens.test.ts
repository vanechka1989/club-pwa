import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "LearningSection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

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

  it("renders module create and edit actions in the routed screen footer", () => {
    expect(source).toContain('class="module-editor-content"');
    expect(source).toContain('class="module-editor-footer"');
    expect(source).toContain('class="module-editor-secondary-actions"');
    expect(source).toContain('class="primary-button ui-button module-editor-save"');
    expect(source).not.toContain('class="module-name-modal ui-card modal-size-compact"');
    expect(styles).toMatch(/\.module-editor-footer\s*\{[^}]*display:\s*grid;[^}]*gap:\s*8px;/s);
    expect(styles).toMatch(/\.module-editor-save\s*\{[^}]*width:\s*100%;/s);
  });

  it("keeps the lesson frame fully inside the mobile viewport", () => {
    expect(styles).toMatch(/\.learning-task-screen-view \.task-screen-body\s*\{[^}]*padding-inline:\s*max\(0\.5rem,/s);
    expect(styles).toMatch(/\.learning-task-screen-view \.lesson-preview-modal-view\s*\{[^}]*overflow:\s*visible;/s);
    expect(styles).toMatch(/\.learning-task-screen-view \.lesson-viewer-content\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*100%;/s);
  });
});
