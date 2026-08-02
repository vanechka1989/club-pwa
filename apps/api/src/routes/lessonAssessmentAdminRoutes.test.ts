import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "admin.ts"), "utf8");
const schema = readFileSync(resolve(__dirname, "../db/schema.ts"), "utf8");
const migration = readFileSync(resolve(__dirname, "../../drizzle/0067_quiz_reset_attempt_id.sql"), "utf8");
const quizResetRoute = source.slice(
  source.indexOf('.post("/learning/assessments/quiz/:id/reset-attempts"'),
  source.indexOf('.get("/learning/materials/:id/assessment"')
);

describe("admin homework completion reset", () => {
  it("only resets an accepted submission and keeps the record in history", () => {
    expect(source).toContain('.post("/learning/assessments/homework/:id/reset"');
    expect(source).toContain('if (submission.status !== "accepted")');
    expect(source).toContain('item.assessmentMode !== "homework"');
    expect(source).toContain('latestSubmission?.id !== submission.id');
    expect(source).toContain('targetRole !== "member" && actorRole !== "owner"');
    expect(source).toContain('eq(homeworkSubmissions.status, "accepted")');
    expect(source).toContain('status: "needs_revision"');
    expect(source).not.toContain("delete(homeworkSubmissions)");
  });

  it("clears lesson completion, notifies the client and records an audit event", () => {
    expect(source).toContain("completedAt: null");
    expect(source).toContain("Домашнее задание открыто повторно");
    expect(source).toContain('pushUrl: `/learning/lessons/${submission.contentItemId}/assessment`');
    expect(source).toContain('action: "learning.homework.reset"');
    expect(source).toContain('eq(appNotifications.source, "lesson_assessment_reset")');
    expect(source).toContain('if (submission.status === "needs_revision" && submission.resetAt)');
    expect(source.indexOf('if (submission.status === "needs_revision" && submission.resetAt)')).toBeLessThan(source.indexOf('latestSubmission?.id !== submission.id'));
    expect(source).toContain('actorUserId: resetByUserId');
    expect(source).toContain('deduplicate: true');
  });
});

describe("admin quiz completion reset", () => {
  it("accepts passed and failed attempts but rejects unfinished attempts", () => {
    expect(quizResetRoute).toContain('attempt.status !== "passed" && attempt.status !== "failed"');
    expect(quizResetRoute).not.toContain('if (attempt.status !== "failed")');
  });

  it("creates the reset marker and clears passed lesson completion atomically", () => {
    const transaction = quizResetRoute.slice(
      quizResetRoute.indexOf("db.transaction"),
      quizResetRoute.indexOf("if (!reset)")
    );

    expect(transaction).toContain("tx.insert(quizAttemptResets)");
    expect(transaction).toContain('if (attempt.status === "passed")');
    expect(transaction).toContain("tx.update(userContentProgress).set({ completedAt: null");
    expect(transaction).toContain("eq(userContentProgress.userId, attempt.userId)");
    expect(transaction).toContain("eq(userContentProgress.contentItemId, attempt.contentItemId)");
  });

  it("reconciles a repeated reset without creating another marker", () => {
    expect(quizResetRoute).toContain("eq(quizAttemptResets.quizAttemptId, attempt.id)");
    expect(quizResetRoute).toContain("onConflictDoNothing");
    expect(quizResetRoute).toContain("await ensureResetEffects(existingReset)");
    expect(quizResetRoute).toContain("return c.json({ ok: true, reconciled: true, reset: existingReset })");
    expect(quizResetRoute.indexOf("await ensureResetEffects(existingReset)")).toBeLessThan(
      quizResetRoute.indexOf("tx.insert(quizAttemptResets)")
    );
    expect(quizResetRoute).toContain('action: "learning.quiz.attempts_reset"');
    expect(quizResetRoute).toContain('source: "lesson_assessment"');
  });

  it("binds one reset marker to one attempt at the database level", () => {
    expect(schema).toContain('quizAttemptId: uuid("quiz_attempt_id")');
    expect(schema).toContain('uniqueIndex("quiz_attempt_resets_quiz_attempt_unique")');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "quiz_attempt_id" uuid');
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "quiz_attempt_resets_quiz_attempt_unique"');
  });

  it("allows only the owner to reset another administrator's quiz", () => {
    expect(quizResetRoute).toContain("targetRole !== \"member\" && actorRole !== \"owner\"");
    expect(quizResetRoute).toContain("Only the owner can reset an administrator's quiz");
  });
});
