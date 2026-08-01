# Separate Lesson Assessment Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the full test/homework constructor out of the lesson form into a dedicated lesson assessment settings page.

**Architecture:** `LearningSection.vue` remains the route-aware owner of the selected lesson and assessment draft. A focused `LessonAssessmentSettingsPage.vue` composes the existing `LessonAssessmentEditor`, while the lesson form receives a small navigation card that opens `/learning/lessons/:lessonId/assessment`. Existing assessment API contracts remain unchanged.

**Tech Stack:** Vue 3 Composition API, Vue Router, TypeScript, Vitest, Testing Library Vue, Playwright.

## Global Constraints

- Preserve all existing assessment business rules and API contracts.
- The dedicated route is `/learning/lessons/:lessonId/assessment`.
- New unsaved lessons cannot open assessment settings.
- Mobile controls have a minimum 44 px tap target and no horizontal overflow from 320 px.
- Test, homework, and `none` modes must all save through the existing assessment endpoint.

---

### Task 1: Register the dedicated learning task route

**Files:**
- Modify: `apps/web/src/features/app/taskNavigation.ts`
- Modify: `apps/web/src/features/app/taskNavigation.test.ts`
- Modify: `apps/web/src/features/learning/learningTaskScreens.test.ts`

**Interfaces:**
- Consumes: existing `sectionFromPath(path: string)` task navigation.
- Produces: recognition of `/learning/lessons/:lessonId/assessment` as the `learning` section.

- [ ] **Step 1: Write the failing route tests**

Add assertions:

```ts
expect(sectionFromPath("/learning/lessons/lesson-1/assessment")).toBe("learning");
expect(source).toContain("/learning/lessons/${selectedLessonItem.value.id}/assessment");
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm --filter @club/web test -- taskNavigation.test.ts learningTaskScreens.test.ts`

Expected: the new assessment route is not recognized or is absent from `LearningSection.vue`.

- [ ] **Step 3: Extend the task route registry**

Add the exact route pattern:

```ts
"/learning/lessons/:lessonId/assessment"
```

- [ ] **Step 4: Run the focused tests**

Run: `pnpm --filter @club/web test -- taskNavigation.test.ts learningTaskScreens.test.ts`

Expected: route recognition passes; the source assertion remains red until Task 3.

### Task 2: Build the focused assessment settings page

**Files:**
- Create: `apps/web/src/features/learning/LessonAssessmentSettingsPage.vue`
- Create: `apps/web/src/features/learning/lessonAssessmentSettingsPage.test.ts`
- Reuse: `apps/web/src/features/learning/LessonAssessmentEditor.vue`

**Interfaces:**
- Consumes props `lessonTitle: string`, `modelValue: LessonAssessmentDraft`, `loading: boolean`, `saving: boolean`, `error: string`.
- Produces emits `update:modelValue`, `save`, `back`, and `retry`.

- [ ] **Step 1: Write a failing component test**

Render with a saved homework draft and assert the page shows the lesson title, current status, editor, back action, and save action:

```ts
render(LessonAssessmentSettingsPage, {
  props: {
    lessonTitle: "Урок 1",
    modelValue: homeworkDraft,
    loading: false,
    saving: false,
    error: ""
  }
});
expect(screen.getByText("Урок 1")).toBeTruthy();
expect(screen.getByRole("button", { name: "Сохранить проверку" })).toBeTruthy();
```

- [ ] **Step 2: Run the component test and verify failure**

Run: `pnpm --filter @club/web test -- lessonAssessmentSettingsPage.test.ts`

Expected: module not found.

- [ ] **Step 3: Implement the page component**

Compose `LessonAssessmentEditor` under a compact page header. Forward `v-model` via:

```ts
const emit = defineEmits<{
  "update:modelValue": [LessonAssessmentDraft];
  save: [];
  back: [];
  retry: [];
}>();
```

Use designed loading/error states and buttons with accessible Russian labels.

- [ ] **Step 4: Run the component test**

Run: `pnpm --filter @club/web test -- lessonAssessmentSettingsPage.test.ts`

Expected: PASS.

### Task 3: Replace the embedded editor with navigation and route state

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/learning/lessonEditorActions.test.ts`
- Modify: `apps/web/src/features/learning/learningTaskScreens.test.ts`

**Interfaces:**
- Consumes: `LessonAssessmentSettingsPage`, `loadAdminLessonAssessment`, `saveLessonAssessment`, `openLearningTask`.
- Produces: `assessmentSettingsMode: Ref<boolean>`, `openAssessmentSettings()`, `closeAssessmentSettings()`, and `saveAssessmentSettings()`.

- [ ] **Step 1: Write failing source/behavior assertions**

Assert that the lesson form no longer embeds `<LessonAssessmentEditor>`, contains the compact title «Проверка знаний», opens the dedicated route, and renders `<LessonAssessmentSettingsPage>`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm --filter @club/web test -- lessonEditorActions.test.ts learningTaskScreens.test.ts lessonAssessmentSettingsPage.test.ts`

- [ ] **Step 3: Add route-aware assessment state**

Add:

```ts
const assessmentSettingsMode = ref(false);

function openAssessmentSettings() {
  if (!selectedLessonItem.value?.isPersisted) return;
  assessmentSettingsMode.value = true;
  void loadAdminLessonAssessment(selectedLessonItem.value.id);
  openLearningTask(`/learning/lessons/${selectedLessonItem.value.id}/assessment`);
}
```

`closeAssessmentSettings()` returns to `/learning/lessons/:id/edit`. `syncLearningTaskRoute()` must match `/assessment`, select the lesson on direct entry, enable the settings mode, and load the assessment.

- [ ] **Step 4: Save independently from the lesson form**

Validate `normalizedAssessmentDraft()`, call `saveLessonAssessment(id, draft)`, copy the public-safe assessment into the selected lesson, show success feedback, and remain on the settings page. Do not call lesson content upload/save APIs.

- [ ] **Step 5: Replace the embedded constructor**

In the lesson form render a compact status row:

```vue
<button type="button" :disabled="!selectedLessonItem?.isPersisted" @click="openAssessmentSettings">
  <span>Проверка знаний</span>
  <strong>{{ assessmentModeLabel }}</strong>
  <span>{{ selectedLessonItem?.isPersisted ? "Настроить" : "Сначала сохраните урок" }}</span>
</button>
```

Render `LessonAssessmentSettingsPage` as the full content of the task screen when `assessmentSettingsMode` is true.

- [ ] **Step 6: Run the focused tests**

Run: `pnpm --filter @club/web test -- lessonEditorActions.test.ts learningTaskScreens.test.ts lessonAssessmentSettingsPage.test.ts taskNavigation.test.ts`

Expected: PASS.

### Task 4: Release verification and deployment

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Produces: next application release and service worker cache version.

- [ ] **Step 1: Update release metadata tests first**

Expect the next patch version and cache key in `releaseNotes.test.ts` and `pwa.test.ts`, then run them to verify failure.

- [ ] **Step 2: Update release metadata and cache**

Move 5.88 into release history, publish the separate assessment settings page in the current Russian/English release notes, and increment the service-worker cache suffix by one.

- [ ] **Step 3: Run full verification**

Run:

```text
pnpm test
pnpm check
pnpm build
pnpm test:e2e:release
git diff --check
```

Expected: all commands pass.

- [ ] **Step 4: Commit, merge, push, and monitor production**

Commit the implementation, merge it into `main`, push `main`, wait for `Deploy to VPS`, and verify both the deployment target commit and `/api/health` return success.
