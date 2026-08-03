import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const componentSource = readFileSync(resolve(__dirname, "LearningSection.vue"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
const routeStylesSource = readFileSync(resolve(__dirname, "learningRoute.css"), "utf8");

describe("lesson editor actions", () => {
  it("moves assessment configuration to a dedicated lesson page", () => {
    expect(componentSource).toContain('import LessonAssessmentSettingsPage from "./LessonAssessmentSettingsPage.vue"');
    expect(componentSource).toContain('class="lesson-assessment-settings-link"');
    expect(componentSource).toContain("Проверка знаний");
    expect(componentSource).toContain("Сначала сохраните урок");
    expect(componentSource).toContain("openLearningTask(`/learning/lessons/${selectedLessonItem.value.id}/assessment`)");
    expect(componentSource).toContain("<LessonAssessmentSettingsPage");
    expect(componentSource).not.toContain("<LessonAssessmentEditor");
  });

  it("places knowledge-check settings directly after cover controls and before lesson content", () => {
    const coverStart = componentSource.indexOf('class="lesson-cover-mode-buttons"');
    const assessmentStart = componentSource.indexOf('class="lesson-assessment-settings-link"');
    const contentStart = componentSource.indexOf('label="Содержимое урока"', coverStart);

    expect(coverStart).toBeGreaterThan(-1);
    expect(assessmentStart).toBeGreaterThan(coverStart);
    expect(assessmentStart).toBeLessThan(contentStart);
  });

  it("renders publication as a compact custom switch instead of a visible native checkbox", () => {
    expect(componentSource).toContain('class="learning-publish-switch__input"');
    expect(componentSource).toContain('class="learning-publish-switch__control"');
    expect(routeStylesSource).toMatch(/\.learning-publish-switch__input\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?opacity:\s*0;/);
    expect(routeStylesSource).toMatch(/\.learning-publish-switch__control\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*26px;/);
  });

  it("keeps saved assessment state separate from the editable draft", () => {
    expect(componentSource).toContain("savedLessonAssessmentDraft");
    expect(componentSource).toContain("assessmentLoadSequence");
    expect(componentSource).toContain("lesson.assessment = toPublicAssessmentConfig(parsed.data)");
    expect(componentSource).toContain("lessonAssessmentDraft.value = cloneAssessmentDraft(savedLessonAssessmentDraft.value)");
  });

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
