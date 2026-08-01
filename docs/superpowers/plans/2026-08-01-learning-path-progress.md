# Learning Path Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add honest module loading states, visible client progress, lesson statuses, and previous/next lesson navigation.

**Architecture:** Extend the existing learning progress response with started and completed lesson identifiers. Keep ordering in the existing module payload, derive presentation through pure helpers in `learningPath.ts`, and render the overall summary through a focused Vue component while preserving the current lesson player and upload flows.

**Tech Stack:** Vue 3, TypeScript, Pinia, Hono, Drizzle ORM, PostgreSQL, Vitest, Testing Library, Playwright, pnpm.

## Global Constraints

- Existing learning URLs and published content behavior must remain backward compatible.
- No new runtime dependency.
- Interactive targets must be at least 44×44 px.
- Verify 320, 390, 768, 1024, and 1440 px without horizontal overflow.
- Demo content must never replace an empty or failed API response.
- Use test-first red-green cycles for every behavior change.

---

### Task 1: Learning progress API contract

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/learningContent.test.ts`
- Modify: `apps/api/src/routes/learning.ts`
- Create: `apps/api/src/learning/learningProgress.ts`
- Create: `apps/api/src/learning/learningProgress.test.ts`

**Interfaces:**
- Produces: `LearningProgressSummary.startedItemIds: string[]`
- Produces: `LearningProgressSummary.completedItemIds: string[]`
- Produces: `serializeLearningProgressRows(rows): { startedItemIds: string[]; completedItemIds: string[] }`

- [ ] **Step 1: Write failing shared and API tests**

```ts
expect(learningProgressSummarySchema.parse({
  totalItems: 2,
  completedItems: 1,
  lastOpenedItem: null,
  lastOpenedAt: null,
  lastOpenedPlaybackPositionSeconds: 0
})).toMatchObject({ startedItemIds: [], completedItemIds: [] });

expect(serializeLearningProgressRows([
  { contentItemId: "lesson-1", completedAt: null },
  { contentItemId: "lesson-2", completedAt: new Date("2026-08-01T00:00:00Z") }
])).toEqual({
  startedItemIds: ["lesson-1", "lesson-2"],
  completedItemIds: ["lesson-2"]
});
```

- [ ] **Step 2: Run the tests and confirm failure because the fields/helper do not exist**

Run: `pnpm --filter @club/shared test -- learningContent.test.ts && pnpm --filter @club/api test -- learningProgress.test.ts`

- [ ] **Step 3: Implement the schema defaults, pure serializer, and published-module progress query**

```ts
export const learningProgressSummarySchema = z.object({
  // existing fields
  startedItemIds: z.array(z.string()).default([]),
  completedItemIds: z.array(z.string()).default([])
});
```

Use the same `moduleContentWhere` filter as the module lesson list, return identifiers only for accessible published lessons, and derive `completedItems` from the filtered rows.

- [ ] **Step 4: Run shared and API tests until green**

Run: `pnpm --filter @club/shared test -- learningContent.test.ts && pnpm --filter @club/api test -- learningProgress.test.ts`

- [ ] **Step 5: Commit the API contract**

```bash
git add packages/shared/src/index.ts packages/shared/src/learningContent.test.ts apps/api/src/routes/learning.ts apps/api/src/learning/learningProgress.ts apps/api/src/learning/learningProgress.test.ts
git commit -m "feat(learning): expose lesson progress states"
```

### Task 2: Pure learning path helpers

**Files:**
- Create: `apps/web/src/features/learning/learningPath.ts`
- Create: `apps/web/src/features/learning/learningPath.test.ts`

**Interfaces:**
- Produces: `getLessonProgressState(lessonId, startedItemIds, completedItemIds): "not_started" | "in_progress" | "completed"`
- Produces: `getModuleProgress(lessonIds, completedItemIds): { completed: number; total: number; percent: number }`
- Produces: `resolveLessonNeighbors(modules, lessonId): { previous: LearningPathLesson | null; next: LearningPathLesson | null }`

- [ ] **Step 1: Write failing table-driven tests**

```ts
expect(getLessonProgressState("a", ["a"], [])).toBe("in_progress");
expect(getLessonProgressState("a", ["a"], ["a"])).toBe("completed");
expect(getModuleProgress(["a", "b", "c"], ["a", "c"])).toEqual({ completed: 2, total: 3, percent: 67 });
expect(resolveLessonNeighbors(modules, "b")).toEqual({ previous: lessonA, next: lessonC });
```

- [ ] **Step 2: Run and observe missing-helper failures**

Run: `pnpm --filter @club/web test -- learningPath.test.ts`

- [ ] **Step 3: Implement minimal pure helpers**

Flatten modules in displayed order, ignore lessons without persisted IDs for member navigation, clamp percentages to `0..100`, and return null neighbors at boundaries.

- [ ] **Step 4: Run helper tests until green**

Run: `pnpm --filter @club/web test -- learningPath.test.ts`

- [ ] **Step 5: Commit helpers**

```bash
git add apps/web/src/features/learning/learningPath.ts apps/web/src/features/learning/learningPath.test.ts
git commit -m "feat(learning): derive module progress and lesson path"
```

### Task 3: Honest loading, empty, and error states

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`
- Modify: `apps/web/src/features/learning/learningMemberContent.test.ts`

**Interfaces:**
- Produces: `modulesLoadError: Ref<string>`
- Produces: `loadModules()` retry action with no demo fallback

- [ ] **Step 1: Add failing component tests**

```ts
expect(screen.queryByText("Вариант 1. Плеер и очередь")).toBeNull();
expect(await screen.findByText("Материалы пока не добавлены")).toBeTruthy();
expect(await screen.findByRole("button", { name: "Повторить загрузку модулей" })).toBeTruthy();
```

Cover successful empty member data, successful empty admin data, rejected API request, and successful retry.

- [ ] **Step 2: Run and observe failures from the current demo fallback**

Run: `pnpm --filter @club/web test -- learningMemberContent.test.ts`

- [ ] **Step 3: Remove runtime demo fallback and render designed states**

Initialize `moduleCards` as an empty array. On error clear content, set `modulesLoadError`, and render an alert with retry. On successful empty response render an empty state; admins receive a `Создать модуль` action.

- [ ] **Step 4: Run member component tests until green**

Run: `pnpm --filter @club/web test -- learningMemberContent.test.ts`

- [ ] **Step 5: Commit honest states**

```bash
git add apps/web/src/features/learning/LearningSection.vue apps/web/src/features/learning/learningRoute.css apps/web/src/features/learning/learningMemberContent.test.ts
git commit -m "fix(learning): show honest module loading states"
```

### Task 4: Overall and per-module progress UI

**Files:**
- Create: `apps/web/src/features/learning/LearningProgressCard.vue`
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`
- Modify: `apps/web/src/features/learning/learningMemberContent.test.ts`

**Interfaces:**
- Consumes: `LearningProgressSummary`, `getLessonProgressState`, `getModuleProgress`
- Produces: accessible overall progress card and lesson status labels

- [ ] **Step 1: Add failing behavior tests**

```ts
expect(await screen.findByText("2 из 3 уроков")).toBeTruthy();
expect(screen.getByRole("progressbar", { name: "Общий прогресс обучения" })).toHaveAttribute("aria-valuenow", "67");
expect(screen.getByText("Пройден")).toBeTruthy();
expect(screen.getByText("В процессе")).toBeTruthy();
```

Also assert that the card is hidden for content administrators and statuses remain text-accessible without color.

- [ ] **Step 2: Run and confirm the progress UI is absent**

Run: `pnpm --filter @club/web test -- learningMemberContent.test.ts learningPath.test.ts`

- [ ] **Step 3: Implement the progress component and module/lesson decorations**

Use semantic progressbar attributes, one compact surface, a thin module bar, and Lucide `CheckCircle2`, `PlayCircle`, and `Circle` icons. Keep admin publication badges unchanged.

- [ ] **Step 4: Run component and helper tests until green**

Run: `pnpm --filter @club/web test -- learningMemberContent.test.ts learningPath.test.ts`

- [ ] **Step 5: Commit progress UI**

```bash
git add apps/web/src/features/learning/LearningProgressCard.vue apps/web/src/features/learning/LearningSection.vue apps/web/src/features/learning/learningRoute.css apps/web/src/features/learning/learningMemberContent.test.ts
git commit -m "feat(learning): show learning progress"
```

### Task 5: Previous and next lesson navigation

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/learningRoute.css`
- Modify: `apps/web/src/features/learning/learningMemberContent.test.ts`

**Interfaces:**
- Consumes: `resolveLessonNeighbors`
- Produces: `openAdjacentLesson(direction: "previous" | "next")`

- [ ] **Step 1: Add failing navigation tests**

Open the middle lesson, assert both controls, click next, and verify the next title and `/learning/lessons/:id` URL. Open the first and last lessons and assert missing boundary actions.

- [ ] **Step 2: Run and confirm the controls are absent**

Run: `pnpm --filter @club/web test -- learningMemberContent.test.ts`

- [ ] **Step 3: Implement accessible previous/next actions**

Stop current engagement via the existing `openLessonModal` flow, open the adjacent persisted lesson, reset scroll to the top, and keep controls above the safe-area inset.

- [ ] **Step 4: Run member and engagement tests until green**

Run: `pnpm --filter @club/web test -- learningMemberContent.test.ts learningEngagementIntegration.test.ts learningCompletion.test.ts`

- [ ] **Step 5: Commit lesson navigation**

```bash
git add apps/web/src/features/learning/LearningSection.vue apps/web/src/features/learning/learningRoute.css apps/web/src/features/learning/learningMemberContent.test.ts
git commit -m "feat(learning): navigate between lessons"
```

### Task 6: Visual regression, release, and deployment readiness

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `playwright.release.config.ts`
- Modify: `apps/web/src/features/app/pwa.test.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Produces: release E2E coverage for client progress, empty/error states, adjacent navigation, and admin module editor

- [ ] **Step 1: Update E2E assertions first and observe expected failures**

Replace the outdated dialog expectation with the current task-screen route. Explicitly enable module edit mode before testing sort controls. Add screenshots at 320, 390, 768, 1024, and 1440 px and assertions for no horizontal overflow.

- [ ] **Step 2: Run focused E2E until all new behavior passes**

Run: `pnpm exec playwright test -c playwright.release.config.ts -g "learning progress path"`

- [ ] **Step 3: Update release metadata and service-worker cache**

Increment release `5.85` to `5.86`, record the learning progress feature, and increment `club-pwa-v257` to `club-pwa-v258`.

- [ ] **Step 4: Run complete verification**

```bash
git diff --check
pnpm check
pnpm test
pnpm build
pnpm test:e2e:release
```

- [ ] **Step 5: Commit release-ready implementation**

```bash
git add tests/e2e/app.spec.ts playwright.release.config.ts apps/web/src/features/app packages/shared/src/release.ts apps/web/public/sw.js
git commit -m "release: add learning progress path"
```

- [ ] **Step 6: Push and verify production**

Push `main`, wait for deployment and device-regression workflows, then verify `/api/health`, `/api/ready`, `club-pwa-v258`, release `5.86`, and the new learning chunk text/styles on production.
