import { describe, expect, it } from "vitest";
import { buildAdminHomeworkResult, buildAdminQuizResult, recordBelongsToUser, resetBelongsToAttempt } from "./assessmentResult";

describe("admin assessment result", () => {
  it("rejects a result that belongs to another client", () => {
    expect(recordBelongsToUser({ userId: "user-a" }, "user-a")).toBe(true);
    expect(recordBelongsToUser({ userId: "user-b" }, "user-a")).toBe(false);
  });

  it("does not attach an older reset to a later quiz attempt", () => {
    expect(resetBelongsToAttempt({ createdAt: new Date("2026-08-01T10:05:00Z") }, { startedAt: new Date("2026-08-01T10:00:00Z") })).toBe(true);
    expect(resetBelongsToAttempt({ createdAt: new Date("2026-08-01T10:05:00Z") }, { startedAt: new Date("2026-08-01T10:10:00Z") })).toBe(false);
    expect(resetBelongsToAttempt(
      { createdAt: new Date("2026-08-01T10:20:00Z") },
      { startedAt: new Date("2026-08-01T10:00:00Z") },
      { startedAt: new Date("2026-08-01T10:10:00Z") }
    )).toBe(false);
  });

  it("builds a complete quiz breakdown in question order", () => {
    const result = buildAdminQuizResult({
      attempt: { id: "attempt", userId: "user-a", contentItemId: "lesson", attemptNumber: 2, status: "failed", earnedPoints: 1, maxPoints: 3, percent: 33, startedAt: new Date("2026-08-01T10:00:00Z"), submittedAt: new Date("2026-08-01T10:05:00Z"), reviewedAt: null },
      lesson: { title: "Тестовая 1", categoryTitle: "Обзорный", passingPercent: 70 },
      questions: [
        { id: "q2", type: "free_text", prompt: "Почему?", points: 2, optionsSnapshot: [], correctOptionIds: [], sortOrder: 2 },
        { id: "q1", type: "single_choice", prompt: "2 + 2", points: 1, optionsSnapshot: [{ id: "a", text: "3" }, { id: "b", text: "4" }], correctOptionIds: ["b"], sortOrder: 1 }
      ],
      answers: [
        { questionSnapshotId: "q1", selectedOptionIds: ["a"], text: null, reviewedPoints: null },
        { questionSnapshotId: "q2", selectedOptionIds: [], text: "Ответ", reviewedPoints: 1 }
      ],
      review: { comment: "Нужно повторить" },
      reset: { reason: "По просьбе клиента", createdAt: new Date("2026-08-01T11:00:00Z") }
    });

    expect(result.mode).toBe("quiz");
    expect(result.questions.map((question) => question.id)).toEqual(["q1", "q2"]);
    expect(result.questions[0]).toMatchObject({ selectedOptionIds: ["a"], correctOptionIds: ["b"], earnedPoints: 0, isCorrect: false });
    expect(result.questions[1]).toMatchObject({ text: "Ответ", earnedPoints: 1, isCorrect: null });
    expect(result.reviewComment).toBe("Нужно повторить");
    expect(result.resetReason).toBe("По просьбе клиента");
  });

  it("builds full homework text, attachments, review and reset history", () => {
    const result = buildAdminHomeworkResult({
      submission: { id: "homework", userId: "user-a", contentItemId: "lesson", version: 3, status: "needs_revision", text: "Мой ответ", submittedAt: new Date("2026-08-01T10:05:00Z"), reviewedAt: new Date("2026-08-01T10:30:00Z"), acceptedAt: null, resetAt: new Date("2026-08-01T11:00:00Z"), resetReason: "Исправить файл" },
      lesson: { title: "Практика", categoryTitle: "Модуль", prompt: "Сделайте работу" },
      attachments: [{ id: "file", fileName: "answer.pdf", contentType: "application/pdf", sizeBytes: 2048, url: "https://files.test/answer" }],
      review: { decision: "needs_revision", comment: "Добавьте пример", createdAt: new Date("2026-08-01T10:30:00Z") }
    });

    expect(result).toMatchObject({ mode: "homework", text: "Мой ответ", version: 3, prompt: "Сделайте работу", reviewComment: "Добавьте пример", resetReason: "Исправить файл" });
    expect(result.attachments[0]).toMatchObject({ fileName: "answer.pdf", sizeBytes: 2048 });
  });
});
