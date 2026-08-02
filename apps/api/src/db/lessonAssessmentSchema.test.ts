import { existsSync, readFileSync } from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import migrationJournal from "../../drizzle/meta/_journal.json";
import {
  assessmentReviews,
  homeworkAttachments,
  homeworkSubmissions,
  lessonAssessmentOptions,
  lessonAssessmentQuestions,
  lessonAssessmentRevisions,
  quizAnswers,
  quizAttemptQuestions,
  quizAttemptResets,
  quizAttempts
} from "./schema";
import * as databaseSchema from "./schema";

const migration = readFileSync(new URL("../../drizzle/0065_lesson_assessments.sql", import.meta.url), "utf8");
const resetMigration = readFileSync(new URL("../../drizzle/0066_homework_submission_resets.sql", import.meta.url), "utf8");

describe("lesson assessment persistence", () => {
  it("exposes normalized configuration, attempts, homework and reviews", () => {
    expect(Object.keys(getTableColumns(lessonAssessmentRevisions))).toEqual(expect.arrayContaining([
      "contentItemId", "revision", "mode", "status", "passingPercent", "maxAttempts", "publishedAt"
    ]));
    expect(Object.keys(getTableColumns(lessonAssessmentQuestions))).toEqual(expect.arrayContaining(["revisionId", "stableKey", "type", "prompt", "points", "sortOrder"]));
    expect(Object.keys(getTableColumns(lessonAssessmentOptions))).toEqual(expect.arrayContaining(["questionId", "stableKey", "text", "isCorrect", "sortOrder"]));
    expect(Object.keys(getTableColumns(quizAttempts))).toEqual(expect.arrayContaining(["userId", "contentItemId", "revisionId", "attemptNumber", "status", "percent"]));
    expect(Object.keys(getTableColumns(quizAttemptQuestions))).toEqual(expect.arrayContaining(["attemptId", "questionKey", "optionsSnapshot", "correctOptionIds"]));
    expect(Object.keys(getTableColumns(quizAnswers))).toEqual(expect.arrayContaining(["attemptId", "questionSnapshotId", "selectedOptionIds", "reviewedPoints"]));
    expect(Object.keys(getTableColumns(homeworkSubmissions))).toEqual(expect.arrayContaining([
      "userId", "contentItemId", "revisionId", "version", "status", "text", "resetAt", "resetByUserId", "resetReason"
    ]));
    expect(Object.keys(getTableColumns(homeworkAttachments))).toEqual(expect.arrayContaining(["submissionId", "objectKey", "contentType", "sizeBytes", "confirmedAt"]));
    expect(Object.keys(getTableColumns(assessmentReviews))).toEqual(expect.arrayContaining(["quizAttemptId", "homeworkSubmissionId", "reviewedByUserId", "decision", "comment"]));
    expect(Object.keys(getTableColumns(quizAttemptResets))).toEqual(expect.arrayContaining(["userId", "contentItemId", "resetByUserId", "reason"]));
  });

  it("registers database constraints that prevent duplicate active work", () => {
    expect(migration).toContain('UNIQUE("content_item_id","revision")');
    expect(migration).toContain('CHECK ("mode" IN (\'quiz\', \'homework\'))');
    expect(migration).toContain('CREATE UNIQUE INDEX "quiz_attempts_user_lesson_open_unique"');
    expect(migration).toContain("WHERE \"status\" = 'in_progress'");
    expect(migration).toContain('CONSTRAINT "assessment_reviews_one_target_check" CHECK');
    expect(migration).toContain('CONSTRAINT "homework_attachments_object_key_unique" UNIQUE("object_key")');
  });

  it("registers migration 0065", () => {
    expect(migrationJournal.entries.find((entry) => entry.tag === "0065_lesson_assessments")).toMatchObject({ idx: 65, version: "7" });
  });

  it("registers reset metadata without deleting homework history", () => {
    expect(resetMigration).toContain('ADD COLUMN "reset_at" timestamp with time zone');
    expect(resetMigration).toContain('ADD COLUMN "reset_by_user_id" uuid');
    expect(resetMigration).toContain('ADD COLUMN "reset_reason" text');
    expect(resetMigration).toContain('CREATE UNIQUE INDEX "app_notifications_assessment_reset_unique"');
    expect(resetMigration).toContain('CREATE UNIQUE INDEX "admin_action_logs_homework_reset_unique"');
    expect(migrationJournal.entries.find((entry) => entry.tag === "0066_homework_submission_resets")).toMatchObject({ idx: 66, version: "7" });
  });

  it("persists each dismissed homework review per user and submission", () => {
    const migrationUrl = new URL("../../drizzle/0068_homework_review_dismissals.sql", import.meta.url);
    expect(existsSync(migrationUrl)).toBe(true);
    expect("homeworkReviewDismissals" in databaseSchema).toBe(true);
    expect(Object.keys(getTableColumns(databaseSchema.homeworkReviewDismissals))).toEqual(expect.arrayContaining([
      "userId", "homeworkSubmissionId", "dismissedAt"
    ]));
    expect(migrationJournal.entries.find((entry) => entry.tag === "0068_homework_review_dismissals")).toMatchObject({ idx: 68, version: "7" });
  });
});
