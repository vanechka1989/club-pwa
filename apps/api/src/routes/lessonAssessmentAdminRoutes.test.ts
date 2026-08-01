import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "admin.ts"), "utf8");

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
