import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(resolve(__dirname, "LearningSection.vue"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

describe("lesson editor actions", () => {
  it("keeps save and delete actions inside the scrolling form without a duplicate close button", () => {
    expect(componentSource).toContain(
      'class="admin-form-actions lesson-preview-actions lesson-preview-actions-edit lesson-editor-inline-actions"'
    );
    expect(componentSource).not.toContain('@click="closeLessonModal">Закрыть</button>');

    const formStart = componentSource.indexOf('class="admin-form lesson-editor-form"');
    const actionsStart = componentSource.indexOf("lesson-editor-inline-actions", formStart);
    const formEnd = componentSource.indexOf("</div>\n          </div>\n        </section>", formStart);

    expect(formStart).toBeGreaterThan(-1);
    expect(actionsStart).toBeGreaterThan(formStart);
    expect(actionsStart).toBeLessThan(formEnd);
  });

  it("renders the actions in normal document flow instead of a floating panel", () => {
    const rule = stylesSource.match(
      /\.learning-task-screen \.admin-form-actions\.lesson-preview-actions-edit \{([\s\S]*?)\}/
    )?.[1] ?? "";

    expect(rule).not.toMatch(/position:\s*(?:fixed|sticky)/);
    expect(rule).not.toContain("backdrop-filter");
    expect(rule).not.toContain("border-top");
    expect(rule).not.toContain("background:");
  });
});
