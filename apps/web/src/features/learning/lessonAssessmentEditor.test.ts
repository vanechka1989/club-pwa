import { cleanup, fireEvent, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it } from "vitest";
import LessonAssessmentEditor from "./LessonAssessmentEditor.vue";

afterEach(cleanup);

describe("LessonAssessmentEditor", () => {
  it("switches between mutually exclusive quiz and homework modes", async () => {
    const { emitted } = render(LessonAssessmentEditor, { props: { modelValue: { mode: "none" } } });

    await fireEvent.click(screen.getByRole("button", { name: "Тест" }));
    expect((emitted()["update:modelValue"]?.at(-1) as unknown[] | undefined)?.[0]).toMatchObject({ mode: "quiz", maxAttempts: 3, passingPercent: 70 });

    await fireEvent.click(screen.getByRole("button", { name: "Домашнее задание" }));
    expect((emitted()["update:modelValue"]?.at(-1) as unknown[] | undefined)?.[0]).toMatchObject({ mode: "homework", allowText: true });
  });

  it("shows an API due date in the datetime-local field", () => {
    render(LessonAssessmentEditor, {
      props: {
        modelValue: {
          mode: "homework",
          title: "Практика",
          instructions: "",
          dueAt: "2026-08-10T09:30:00.000Z",
          allowText: true,
          allowAttachments: false,
          allowedFileKinds: ["image"],
          maxAttachments: 3
        }
      }
    });

    expect((screen.getByLabelText(/Срок сдачи/) as HTMLInputElement).value).toMatch(/^2026-08-10T/);
  });
});
