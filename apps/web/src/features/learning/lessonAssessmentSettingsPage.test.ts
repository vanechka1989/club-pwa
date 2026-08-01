import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import type { LessonAssessmentDraft } from "@club/shared";
import LessonAssessmentSettingsPage from "./LessonAssessmentSettingsPage.vue";

const homeworkDraft: LessonAssessmentDraft = {
  mode: "homework",
  title: "Практика",
  instructions: "Прикрепите результат",
  dueAt: null,
  allowText: true,
  allowAttachments: false,
  allowedFileKinds: ["image"],
  maxAttachments: 3
};

afterEach(cleanup);

describe("LessonAssessmentSettingsPage", () => {
  it("presents assessment editing as a separate lesson screen", async () => {
    const view = render(LessonAssessmentSettingsPage, {
      props: {
        lessonTitle: "Урок 1",
        modelValue: homeworkDraft,
        loading: false,
        saving: false,
        error: ""
      }
    });

    expect(screen.getByText("Урок 1")).toBeTruthy();
    expect(screen.getAllByText("Домашнее задание").length).toBeGreaterThan(0);
    await fireEvent.click(screen.getByRole("button", { name: "Сохранить проверку" }));
    expect(view.emitted().save).toHaveLength(1);
  });

  it("offers retry when settings cannot be loaded", async () => {
    const view = render(LessonAssessmentSettingsPage, {
      props: {
        lessonTitle: "Урок 1",
        modelValue: { mode: "none" },
        loading: false,
        saving: false,
        error: "Не удалось загрузить настройки.",
        retryable: true
      }
    });

    await fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(view.emitted().retry).toHaveLength(1);
  });

  it("keeps the editor available after a validation or save error", () => {
    render(LessonAssessmentSettingsPage, {
      props: {
        lessonTitle: "Урок 1",
        modelValue: homeworkDraft,
        loading: false,
        saving: false,
        error: "Проверьте настройки задания.",
        retryable: false
      }
    });

    expect(screen.getByRole("button", { name: "Сохранить проверку" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
  });
});
