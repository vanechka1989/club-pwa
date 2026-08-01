import { fireEvent, render, screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";
import LessonAssessmentEditor from "./LessonAssessmentEditor.vue";

describe("LessonAssessmentEditor", () => {
  it("switches between mutually exclusive quiz and homework modes", async () => {
    const { emitted } = render(LessonAssessmentEditor, { props: { modelValue: { mode: "none" } } });

    await fireEvent.click(screen.getByRole("button", { name: "Тест" }));
    expect((emitted()["update:modelValue"]?.at(-1) as unknown[] | undefined)?.[0]).toMatchObject({ mode: "quiz", maxAttempts: 3, passingPercent: 70 });

    await fireEvent.click(screen.getByRole("button", { name: "Домашнее задание" }));
    expect((emitted()["update:modelValue"]?.at(-1) as unknown[] | undefined)?.[0]).toMatchObject({ mode: "homework", allowText: true });
  });
});
