# Member assessment flow and admin insights

## Goal

Move quiz and homework completion out of the lesson body, make outcomes explicit for members, and give administrators assessment visibility and a safe per-client homework reset.

## Member experience

The lesson page no longer renders quiz questions, homework inputs, or upload controls inline. It renders one assessment entry card after the lesson materials and before notes. The card uses mode-specific copy and iconography:

- Quiz: `Пройти тест`, list-check icon, passing threshold and latest result.
- Homework: `Сдать домашнее задание`, file-check icon, review status and latest version.

The card opens `/learning/lessons/:lessonId/assessment`. For members, this route is a dedicated task screen containing the assessment player. For administrators, the same route keeps the existing assessment-settings page. Back navigation returns members to the lesson and administrators to the lesson editor.

The member assessment page owns loading, empty, error, answering, uploading, submission, and result states. A completed quiz result shows status, earned and maximum points, percentage, passing threshold, attempt number, submission time, and remaining attempts. Homework history shows version, status, submission/review time, reset state, and reviewer comment. Accepted and pending work cannot be submitted again; revision-required or administrator-reset work can be resubmitted as a new version.

## Homework reset

Only an accepted homework submission exposes the admin reset action. `POST /admin/learning/assessments/homework/:submissionId/reset` must:

1. Require the existing learning/materials administration capability.
2. Reject missing or non-accepted submissions.
3. In one transaction, set the submission to `needs_revision`, store reset time, actor, and optional reason, and clear `completedAt` for that user and lesson while retaining view history.
4. Create an in-app/push notification linking to the dedicated assessment route.
5. Record an administrator action with client, lesson, submission, and reason metadata.

The original submission, attachments, review, and accepted result remain available as history. A new member submission creates the next version.

## Administrator client card

`AdminUserDetailResponse` gains `learningAssessments`, ordered by the latest assessment activity. Each record identifies the lesson/category, mode, latest submission or attempt, status, result details, timestamps, review/reset comments, and whether reset is currently allowed.

The client task screen adds a `Тесты и домашние задания` accordion. Each item has a semantic status badge and concrete result details. Accepted homework includes a destructive-secondary `Сбросить прохождение` action with a confirmation dialog. After success the client detail reloads so the UI cannot show stale completion data.

## Learning analytics

The existing learning engagement response gains an `assessments` summary for the selected date range:

- homework submitted;
- homework accepted;
- homework pending review;
- homework needing revision;
- quiz attempts submitted;
- quizzes passed.

The learning analytics screen renders a separate assessment section without changing existing viewing KPIs. Empty and error behavior follows the existing dashboard.

## Data model and compatibility

Add nullable reset metadata to `homework_submissions`: `reset_at`, `reset_by_user_id`, and `reset_reason`. Existing records remain valid. Shared response schemas provide defaults for new analytics/client-detail fields so older payloads remain parseable during deployment.

## Security and reliability

- The reset endpoint derives the target user and lesson from the server-side submission; it never trusts client-supplied IDs.
- Reset is idempotency-safe at the state boundary: a second reset receives `409` and does not duplicate notifications or audit entries.
- Homework uploads remain direct-to-S3 and retain current type/count/size validation.
- Member status endpoints expose only the signed-in member's assessment data.

## Verification

- Unit/API tests cover member routing, explicit results, reset authorization/state changes, client detail aggregation, and analytics counters.
- Playwright verifies the lesson entry card, separate assessment screen, result layout, client-card reset affordance, and mobile overflow.
- Run workspace tests, type checks, production build, release browser suite, deployment workflow, and production health/readiness checks.
