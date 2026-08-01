# Lesson Assessments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в урок взаимоисключаемый тест или домашнее задание, безопасное прохождение клиентом и ручную проверку администратором.

**Architecture:** Конфигурация проверки хранится ревизиями, а каждая отправленная попытка получает неизменяемый снимок вопросов. Чистая доменная логика оценки отделяется от Hono-маршрутов; клиентский редактор, прохождение и очередь проверки становятся отдельными Vue-компонентами, подключёнными к существующему `LearningSection`.

**Tech Stack:** TypeScript, Vue 3, Pinia, Hono, PostgreSQL, Drizzle ORM, Zod, S3 signed uploads, Vitest, Testing Library Vue, Playwright.

## Global Constraints

- Для урока разрешён ровно один режим: `none`, `quiz` или `homework`.
- Тест поддерживает `single_choice`, `multiple_choice` и `free_text`.
- Максимальное количество попыток задаёт администратор; минимум — одна попытка.
- Домашняя работа принимает текст и файлы; хотя бы один способ ответа включён.
- Урок завершается только после теста `passed` или домашней работы `accepted`.
- Клиент не получает правильные ответы до завершения попытки и никогда не получает ответы другого клиента.
- Вложения идут напрямую в S3; API не принимает крупные файлы через `multipart/form-data`.
- Все управляющие элементы имеют область нажатия не меньше 44×44 px.
- Проверяем ширины 320, 390, 768, 1024 и 1440 px без горизонтального переполнения.

---

### Task 1: Shared contracts and assessment domain

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/learningContent.test.ts`
- Create: `apps/api/src/learning/assessmentScoring.ts`
- Create: `apps/api/src/learning/assessmentScoring.test.ts`

**Interfaces:**
- Produces: `LessonAssessmentMode`, `LessonAssessmentConfig`, `LessonAssessmentState`, `QuizAttemptResult`, `scoreAutomaticAnswers(config, answers)`.
- Consumes: existing `LearningContent` and Zod response conventions from `packages/shared/src/index.ts`.

- [ ] **Step 1: Write failing shared-contract tests**

```ts
expect(lessonAssessmentConfigSchema.parse({
  mode: "quiz",
  title: "Проверка",
  instructions: null,
  passingPercent: 70,
  maxAttempts: 3,
  questions: [
    { id: "q1", type: "single_choice", prompt: "2 + 2?", points: 1,
      options: [{ id: "o1", text: "4" }, { id: "o2", text: "5" }] }
  ]
}).mode).toBe("quiz");
```

Also assert that `learningContentSchema` accepts `assessment: null` and a safe published assessment without correctness fields.

- [ ] **Step 2: Run the shared test and verify red**

Run: `pnpm --filter @club/shared test -- src/learningContent.test.ts`

Expected: FAIL because `lessonAssessmentConfigSchema` and `assessment` do not exist.

- [ ] **Step 3: Add exact schemas and types**

```ts
export const lessonAssessmentModeSchema = z.enum(["none", "quiz", "homework"]);
export const quizQuestionTypeSchema = z.enum(["single_choice", "multiple_choice", "free_text"]);
export const lessonAssessmentConfigSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("none") }),
  z.object({ mode: z.literal("quiz"), title: z.string().min(1).max(180), instructions: z.string().max(4000).nullable(), passingPercent: z.number().int().min(1).max(100), maxAttempts: z.number().int().min(1).max(100), questions: z.array(quizQuestionSchema).min(1).max(100) }),
  z.object({ mode: z.literal("homework"), title: z.string().min(1).max(180), instructions: z.string().min(1).max(8000), dueAt: z.string().datetime().nullable(), allowText: z.boolean(), allowAttachments: z.boolean(), allowedFileKinds: z.array(z.enum(["image", "document", "video"])), maxAttachments: z.number().int().min(1).max(10) })
]);
```

Use a public question schema without `isCorrect`; correctness remains server-only.

- [ ] **Step 4: Write failing scoring tests**

Cover exact single-choice scoring, exact-set multiple-choice scoring, unanswered questions, free-text `pending_review`, weighted points and passing percentage rounding.

- [ ] **Step 5: Implement pure scoring**

```ts
export function scoreAutomaticAnswers(config: StoredQuizRevision, answers: StoredQuizAnswer[]) {
  const automatic = config.questions.filter((question) => question.type !== "free_text");
  const earnedPoints = automatic.reduce((total, question) => total + scoreQuestion(question, answers), 0);
  const automaticMaxPoints = automatic.reduce((total, question) => total + question.points, 0);
  return { earnedPoints, automaticMaxPoints, requiresReview: config.questions.some((question) => question.type === "free_text") };
}
```

- [ ] **Step 6: Run Task 1 tests and checks**

Run: `pnpm --filter @club/shared test -- src/learningContent.test.ts; pnpm --filter @club/api test -- src/learning/assessmentScoring.test.ts; pnpm --filter @club/shared check; pnpm --filter @club/api check`

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/learningContent.test.ts apps/api/src/learning/assessmentScoring.ts apps/api/src/learning/assessmentScoring.test.ts
git commit -m "feat(learning): define lesson assessment contracts"
```

### Task 2: Persistence and migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0065_lesson_assessments.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create: `apps/api/src/db/lessonAssessmentSchema.test.ts`

**Interfaces:**
- Produces tables `lessonAssessmentRevisions`, `lessonAssessmentQuestions`, `lessonAssessmentOptions`, `quizAttempts`, `quizAttemptQuestions`, `quizAnswers`, `homeworkSubmissions`, `homeworkAttachments`, `assessmentReviews`, `quizAttemptResets`.
- Consumes assessment enum strings from Task 1.

- [ ] **Step 1: Write the failing schema test**

```ts
expect(Object.keys(getTableColumns(lessonAssessmentRevisions))).toEqual(expect.arrayContaining([
  "contentItemId", "revision", "mode", "status", "passingPercent", "maxAttempts", "publishedAt"
]));
expect(migration).toContain('UNIQUE("content_item_id","revision")');
expect(migration).toContain('CHECK ("mode" IN (\'quiz\', \'homework\'))');
```

Assert uniqueness for one open quiz attempt per user and lesson, one idempotency key per submission, and immutable question snapshots.

- [ ] **Step 2: Run the schema test and verify red**

Run: `pnpm --filter @club/api test -- src/db/lessonAssessmentSchema.test.ts`

Expected: FAIL because tables and migration are absent.

- [ ] **Step 3: Add Drizzle tables and relations**

Add `assessmentMode` and `publishedAssessmentRevisionId` to `contentItems`. Use JSONB only for immutable option snapshots inside attempt questions; editable configuration remains normalized.

- [ ] **Step 4: Add migration 0065 and journal entry**

Create constraints for status enums, positive points, 1–100 passing percentages, positive attempt limits, ownership foreign keys, idempotency keys and review uniqueness. Add indices for pending-review queue, user history and cleanup of unconfirmed attachments.

- [ ] **Step 5: Run schema and type checks**

Run: `pnpm --filter @club/api test -- src/db/lessonAssessmentSchema.test.ts; pnpm --filter @club/api check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/0065_lesson_assessments.sql apps/api/drizzle/meta/_journal.json apps/api/src/db/lessonAssessmentSchema.test.ts
git commit -m "feat(db): persist lesson assessments"
```

### Task 3: Admin configuration and revision publishing API

**Files:**
- Create: `apps/api/src/learning/assessmentConfig.ts`
- Create: `apps/api/src/learning/assessmentConfig.test.ts`
- Create: `apps/api/src/routes/adminLearningAssessments.ts`
- Create: `apps/api/src/routes/adminLearningAssessments.test.ts`
- Modify: `apps/api/src/routes/admin.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces: `validateStoredAssessmentDraft`, `publishAssessmentRevision(tx, contentItemId, input, actorId)`, admin GET/PUT endpoints under `/admin/learning/assessments/:lessonId`.
- Consumes tables from Task 2 and schemas from Task 1.

- [ ] **Step 1: Write failing validation tests**

Test rejection of two modes, missing questions, single choice with two correct options, multiple choice without correct options, homework with both input methods disabled, duplicate question/option IDs and invalid points.

- [ ] **Step 2: Implement draft validation**

Return field-addressable issues such as `{ path: "questions.0.options", message: "Выберите один правильный ответ" }`; never expose correctness through member response serializers.

- [ ] **Step 3: Write failing route authorization and revision tests**

Assert `materials` permission is required, saving a draft does not affect the published revision, publishing increments revision atomically, and editing creates a new revision rather than changing an existing published row.

- [ ] **Step 4: Implement isolated admin route**

```ts
export const adminLearningAssessmentsRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", sessionAuth, requireAdminPermission("materials"))
  .get("/:lessonId", getAssessmentEditorState)
  .put("/:lessonId", saveAssessmentDraft)
  .post("/:lessonId/publish", publishAssessmentDraft);
```

Mount it before the generic admin route and include assessment summary in `GET /admin/learning`.

- [ ] **Step 5: Add typed web clients**

Add `getAdminLessonAssessment`, `saveAdminLessonAssessment`, and `publishAdminLessonAssessment` using shared schemas.

- [ ] **Step 6: Run focused tests and checks**

Run: `pnpm --filter @club/api test -- src/learning/assessmentConfig.test.ts src/routes/adminLearningAssessments.test.ts; pnpm check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/learning/assessmentConfig.ts apps/api/src/learning/assessmentConfig.test.ts apps/api/src/routes/adminLearningAssessments.ts apps/api/src/routes/adminLearningAssessments.test.ts apps/api/src/routes/admin.ts apps/web/src/api/client.ts
git commit -m "feat(admin): configure lesson assessments"
```

### Task 4: Member quiz attempts and completion gate

**Files:**
- Create: `apps/api/src/learning/quizAttemptService.ts`
- Create: `apps/api/src/learning/quizAttemptService.test.ts`
- Create: `apps/api/src/routes/learningAssessments.ts`
- Create: `apps/api/src/routes/learningAssessmentsSecurity.test.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/routes/learning.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces member endpoints `GET /learning/items/:id/assessment`, `POST /quiz-attempts`, `PUT /quiz-attempts/:attemptId/answers/:questionId`, `POST /quiz-attempts/:attemptId/submit`.
- Consumes scoring from Task 1, persistence from Task 2 and membership checks already used by `learningRoute`.

- [ ] **Step 1: Write failing service tests**

Cover atomic attempt numbering, configurable limit, reuse of one open attempt, frozen question snapshots, automatic pass/fail, free-text pending review and idempotent submission.

- [ ] **Step 2: Implement transactional attempt service**

Create the attempt and snapshot rows in one transaction. Lock the user/lesson attempt set before assigning `attemptNumber`. Save answers only while status is `in_progress`.

- [ ] **Step 3: Write failing BOLA and payload tests**

Assert another user cannot read or modify an attempt by changing its UUID, expired members cannot start an attempt, and pre-submit responses do not contain correct option IDs.

- [ ] **Step 4: Implement member routes**

Use `telegramAuth`, resolve current `userId`, require the published lesson and active membership, and always query attempts with both `attemptId` and `userId`.

- [ ] **Step 5: Gate manual completion**

Update `/learning/items/:id/complete` so assessment lessons return `409 assessment_required` until the server finds `passed` or `accepted`. Assessment services set `userContentProgress.completedAt` themselves after success.

- [ ] **Step 6: Add typed clients and run checks**

Run: `pnpm --filter @club/api test -- src/learning/quizAttemptService.test.ts src/routes/learningAssessmentsSecurity.test.ts; pnpm check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/learning/quizAttemptService.ts apps/api/src/learning/quizAttemptService.test.ts apps/api/src/routes/learningAssessments.ts apps/api/src/routes/learningAssessmentsSecurity.test.ts apps/api/src/index.ts apps/api/src/routes/learning.ts apps/web/src/api/client.ts
git commit -m "feat(learning): add secure quiz attempts"
```

### Task 5: Homework submission and direct S3 attachments

**Files:**
- Create: `apps/api/src/learning/homeworkUpload.ts`
- Create: `apps/api/src/learning/homeworkUpload.test.ts`
- Create: `apps/api/src/learning/homeworkSubmissionService.ts`
- Create: `apps/api/src/learning/homeworkSubmissionService.test.ts`
- Modify: `apps/api/src/routes/learningAssessments.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces endpoints for homework draft, signed upload, confirmation, submission and member history.
- Consumes S3 helpers in `apps/api/src/storage/s3Object.ts` and direct-upload verification patterns in `apps/api/src/learning/directUploadVerification.ts`.

- [ ] **Step 1: Write failing upload-policy tests**

Test image/document/video MIME allowlists, maximum declared size, maximum attachment count, sanitized object keys, ownership and rejection of already consumed objects.

- [ ] **Step 2: Implement homework upload policy**

```ts
export function buildHomeworkObjectKey(userId: string, lessonId: string, submissionId: string, fileName: string) {
  return `homework/${userId}/${lessonId}/${submissionId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}
```

Issue short-lived signed PUT URLs and verify object size/content type before confirmation.

- [ ] **Step 3: Write failing versioning tests**

Cover text-only, attachment-only, invalid empty answer, immutable submitted version, required review comment on `needs_revision`, and new version after return.

- [ ] **Step 4: Implement transactional submission service and routes**

Endpoints: `POST /homework/drafts`, `POST /homework/:submissionId/uploads`, `POST /homework/:submissionId/attachments`, `POST /homework/:submissionId/submit`, `GET /homework/history`.

- [ ] **Step 5: Add typed web clients and focused verification**

Run: `pnpm --filter @club/api test -- src/learning/homeworkUpload.test.ts src/learning/homeworkSubmissionService.test.ts src/routes/learningAssessmentsSecurity.test.ts; pnpm check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/learning/homeworkUpload.ts apps/api/src/learning/homeworkUpload.test.ts apps/api/src/learning/homeworkSubmissionService.ts apps/api/src/learning/homeworkSubmissionService.test.ts apps/api/src/routes/learningAssessments.ts apps/web/src/api/client.ts
git commit -m "feat(learning): submit homework with direct uploads"
```

### Task 6: Admin review queue, decisions and notifications

**Files:**
- Create: `apps/api/src/learning/assessmentReviewService.ts`
- Create: `apps/api/src/learning/assessmentReviewService.test.ts`
- Modify: `apps/api/src/routes/adminLearningAssessments.ts`
- Modify: `apps/api/src/admin/attention.ts`
- Modify: `apps/api/src/admin/attention.test.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces queue endpoints and decisions for free-text quizzes/homework plus attempt reset.
- Consumes existing notification creation and admin action log services.

- [ ] **Step 1: Write failing decision tests**

Cover free-text point bounds, one decision per pending review, final pass/fail calculation, accept/revision transitions, required revision comment, completion timestamp, notification payload and idempotency.

- [ ] **Step 2: Implement review service**

Use one transaction for review row, status change, lesson completion, admin action log and outbox notification. A repeated idempotency key returns the existing decision.

- [ ] **Step 3: Write failing queue and attention tests**

Assert filters by type/status/module/date, newest first, pending count, and no double counting between quiz and homework attention aggregates.

- [ ] **Step 4: Add admin routes**

Add `GET /reviews`, `GET /reviews/:id`, `POST /reviews/:id/quiz`, `POST /reviews/:id/homework`, and `POST /lessons/:lessonId/users/:userId/reset-attempts`.

- [ ] **Step 5: Integrate internal notifications and attention**

Use titles «Тест проверен», «Домашнее задание принято» and «Задание возвращено на доработку». Attention item links directly to the review queue.

- [ ] **Step 6: Run focused tests and checks**

Run: `pnpm --filter @club/api test -- src/learning/assessmentReviewService.test.ts src/admin/attention.test.ts src/routes/adminLearningAssessments.test.ts; pnpm check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/learning/assessmentReviewService.ts apps/api/src/learning/assessmentReviewService.test.ts apps/api/src/routes/adminLearningAssessments.ts apps/api/src/admin/attention.ts apps/api/src/admin/attention.test.ts apps/web/src/api/client.ts
git commit -m "feat(admin): review lesson assessments"
```

### Task 7: Lesson editor assessment controls

**Files:**
- Create: `apps/web/src/features/learning/LessonAssessmentEditor.vue`
- Create: `apps/web/src/features/learning/LessonQuizQuestionEditor.vue`
- Create: `apps/web/src/features/learning/lessonAssessmentDraft.ts`
- Create: `apps/web/src/features/learning/LessonAssessmentEditor.test.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`

**Interfaces:**
- Produces `v-model:config` editor with `none | quiz | homework` and `validateLessonAssessmentDraft`.
- Consumes admin API from Task 3 and app-level themed confirmation dialog.

- [ ] **Step 1: Write failing editor tests**

Render default «Без задания», switch to quiz, add all three question types, reorder/delete questions, configure pass percent/attempt count, switch to homework after confirmation, and validate at least one homework answer method.

- [ ] **Step 2: Implement draft helpers and components**

Keep correctness only in the admin draft. Use stable client IDs for unsaved questions/options. Use `UiPageHeader`/existing admin fields and native checkbox semantics with styled 44×44 switch rows.

- [ ] **Step 3: Integrate into lesson save**

Load the assessment when editing an existing lesson; after the lesson material save succeeds, save/publish its assessment. If the assessment save fails, surface a recovery action without pretending the whole operation succeeded.

- [ ] **Step 4: Add responsive styles**

At 320–390 px use one column, full-width question controls and sticky save action inside the existing modal scrolling area. At tablet/desktop allow two-column numeric settings but never nest cards inside cards.

- [ ] **Step 5: Run component and type tests**

Run: `pnpm --filter @club/web test -- src/features/learning/LessonAssessmentEditor.test.ts src/features/learning/learningArchive.test.ts; pnpm --filter @club/web check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/learning/LessonAssessmentEditor.vue apps/web/src/features/learning/LessonQuizQuestionEditor.vue apps/web/src/features/learning/lessonAssessmentDraft.ts apps/web/src/features/learning/LessonAssessmentEditor.test.ts apps/web/src/features/learning/LearningSection.vue apps/web/src/features/learning/learningRoute.css
git commit -m "feat(learning): configure assessments in lessons"
```

### Task 8: Member quiz and homework interfaces

**Files:**
- Create: `apps/web/src/features/learning/LessonQuizRunner.vue`
- Create: `apps/web/src/features/learning/LessonQuizRunner.test.ts`
- Create: `apps/web/src/features/learning/LessonHomeworkSubmission.vue`
- Create: `apps/web/src/features/learning/LessonHomeworkSubmission.test.ts`
- Create: `apps/web/src/features/learning/useLessonAssessment.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`

**Interfaces:**
- Produces assessment block in member lesson and state composable for drafts/retries.
- Consumes member APIs from Tasks 4–5 and existing direct-upload utility.

- [ ] **Step 1: Write failing quiz UI tests**

Cover remaining attempts, sequential questions, draft persistence, submission, pass/fail, pending review, exhausted attempts and no correctness leakage before completion.

- [ ] **Step 2: Implement quiz runner**

Use a progress label «Вопрос 2 из 5», explicit previous/next controls, disabled final submit until required answers exist, and server state as the source of truth after every mutation.

- [ ] **Step 3: Write failing homework UI tests**

Cover text, attachments, direct upload progress, pending review, revision comment, new version, accepted state, retry after network failure and file removal before submission.

- [ ] **Step 4: Implement homework component and composable**

Reuse `prepareDirectUpload`, preserve text during upload failures, announce upload status, and show immutable history below the active draft.

- [ ] **Step 5: Integrate completion behavior**

Assessment lessons replace manual completion with their assessment status; normal lessons retain current behavior. Previous/next navigation remains available, but completion badges change only after server success.

- [ ] **Step 6: Run focused tests and checks**

Run: `pnpm --filter @club/web test -- src/features/learning/LessonQuizRunner.test.ts src/features/learning/LessonHomeworkSubmission.test.ts src/features/learning/learningMemberContent.test.ts; pnpm --filter @club/web check`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/learning/LessonQuizRunner.vue apps/web/src/features/learning/LessonQuizRunner.test.ts apps/web/src/features/learning/LessonHomeworkSubmission.vue apps/web/src/features/learning/LessonHomeworkSubmission.test.ts apps/web/src/features/learning/useLessonAssessment.ts apps/web/src/features/learning/LearningSection.vue apps/web/src/features/learning/learningRoute.css
git commit -m "feat(learning): complete lesson assessments"
```

### Task 9: Admin review queue interface

**Files:**
- Create: `apps/web/src/features/learning/AdminAssessmentReviewQueue.vue`
- Create: `apps/web/src/features/learning/AdminAssessmentReviewDetail.vue`
- Create: `apps/web/src/features/learning/AdminAssessmentReviewQueue.test.ts`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Produces queue and detail screens addressable from «Модули» and «Требует внимания».
- Consumes admin review APIs from Task 6.

- [ ] **Step 1: Write failing queue component tests**

Cover pending badge, filters, empty/error/retry states, free-text point inputs, accept/revision confirmation, required comment and attempt reset.

- [ ] **Step 2: Implement queue/detail components**

Keep list and detail independent. Detail loads by review ID so direct links and browser back work. Use accessible status labels and an in-app confirmation for destructive resets.

- [ ] **Step 3: Integrate navigation and attention deep-link**

Add «Работы на проверке» in modules admin actions and route query `?task=assessment-reviews&review=<id>` for attention links.

- [ ] **Step 4: Write E2E scenarios**

Add mocked flows for automatic quiz pass, free-text review, homework revision/resubmission, attention deep-link and another-user access rejection. Assert no horizontal overflow.

- [ ] **Step 5: Run component and desktop E2E tests**

Run: `pnpm --filter @club/web test -- src/features/learning/AdminAssessmentReviewQueue.test.ts; pnpm exec playwright test tests/e2e/app.spec.ts --grep "lesson assessment" --project=desktop-chrome`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/learning/AdminAssessmentReviewQueue.vue apps/web/src/features/learning/AdminAssessmentReviewDetail.vue apps/web/src/features/learning/AdminAssessmentReviewQueue.test.ts apps/web/src/features/learning/LearningSection.vue apps/web/src/features/learning/learningRoute.css tests/e2e/app.spec.ts
git commit -m "feat(admin): add assessment review queue"
```

### Task 10: Release verification and deployment

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `playwright.release.config.ts`

**Interfaces:**
- Produces a new release and cache version, verified locally and in GitHub Actions.
- Consumes all prior tasks.

- [ ] **Step 1: Add release metadata tests and update metadata**

Increment the release after checking the current value at execution time. Release notes must mention configurable test/homework choice, manual review and client notifications. Increment the service-worker cache exactly once.

- [ ] **Step 2: Add assessment scenarios to release E2E grep**

Include the named E2E flows from Task 9 in `playwright.release.config.ts` so Chrome, Firefox, Android and iPhone run them.

- [ ] **Step 3: Run the complete local verification gate**

Run: `pnpm check; pnpm test; pnpm build; pnpm test:e2e:release`

Expected: exit 0 for every command and no failed tests.

- [ ] **Step 4: Perform visual viewport audit**

Capture and inspect lesson editor, quiz runner, homework submission and review detail at 320×720, 390×844, 768×1024, 1024×768 and 1440×900. Fix overlaps, clipped text, keyboard obstruction and horizontal overflow, then rerun focused E2E.

- [ ] **Step 5: Commit release metadata**

```bash
git add packages/shared/src/release.ts apps/web/src/features/app/releaseNotes.ts apps/web/src/features/app/releaseHistory.ts apps/web/src/features/app/releaseNotes.test.ts apps/web/src/features/app/pwa.test.ts apps/web/public/sw.js playwright.release.config.ts tests/e2e/app.spec.ts
git commit -m "release: publish lesson assessments"
```

- [ ] **Step 6: Merge and deploy**

Fast-forward the verified feature branch into `main`, rerun `pnpm test` on the merged tree, push `main`, and wait for the `Deploy to VPS` workflow with `gh run watch --exit-status`.

- [ ] **Step 7: Verify production**

Check `https://club2.myn8nservertest.ru/api/health`, `/api/ready`, the published release number, service-worker cache and the assessment migration. Report only after every check is green.
