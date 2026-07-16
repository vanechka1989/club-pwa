# Admin Lesson View-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make existing lessons open in the member viewer for administrators, with editing available only through a header action.

**Architecture:** Keep one selected lesson and derive its presentation mode from the active learning task path. Reuse the existing member viewer and editor markup, exposing the editor only for authorized `/edit` routes and returning to viewer mode after back or save.

**Tech Stack:** Vue 3, TypeScript, Vue Router task routes, Testing Library, Vitest, existing PWA design tokens.

## Global Constraints

- Existing lessons open in viewer mode for every role.
- Only users with module-management permission can enter editor mode.
- New lessons still open directly in the editor.
- Successful save returns to viewer; failed save preserves editor state.
- No API or database changes.

---

### Task 1: View-first lesson state and routing

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Test: `apps/web/src/features/learning/learningArchive.test.ts`

**Interfaces:**
- Consumes: `canManageModules`, `selectedLessonItem`, `activeLearningTaskPath` and existing task-route helpers.
- Produces: a computed `isLessonEditorMode`, an `openLessonEditor` action, and a lesson-specific back handler.

- [ ] **Step 1: Write the failing behavior tests**

Add tests asserting that an owner opening an existing lesson sees `.lesson-viewer-content`, does not see `Название урока`, and sees exactly one button named `Редактировать урок`. Add a navigation test that clicks the action and then sees the editor; pressing the task back action must restore the viewer.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter @club/web test -- src/features/learning/learningArchive.test.ts`

Expected: FAIL because owners currently open `/edit` immediately and do not render the viewer.

- [ ] **Step 3: Implement route-derived mode**

In `LearningSection.vue`:

```ts
const isLessonEditorMode = computed(() => {
  if (!selectedLessonItem.value) return true;
  return canManageModules.value && /\/edit$/.test(activeLearningTaskPath.value ?? "");
});

function openLessonEditor() {
  if (!canManageModules.value || !selectedLessonItem.value) return;
  openLearningTask(`/learning/lessons/${selectedLessonItem.value.id}/edit`);
}

function handleLessonBack() {
  if (isLessonEditorMode.value && selectedLessonItem.value) {
    openLearningTask(`/learning/lessons/${selectedLessonItem.value.id}`);
    return;
  }
  closeLessonModal();
}
```

Make `openLessonModal` use `/learning/lessons/:id` for all roles. Preserve direct authorized `/edit` routes in the route synchronization logic.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @club/web test -- src/features/learning/learningArchive.test.ts`

Expected: all learning archive tests pass.

### Task 2: Header edit action and viewer/editor rendering

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/features/learning/learningArchive.test.ts`

**Interfaces:**
- Consumes: `isLessonEditorMode` and `openLessonEditor` from Task 1.
- Produces: a compact accessible header action and role-independent viewer rendering.

- [ ] **Step 1: Add failing UI assertions**

Assert that the header action is rendered only for an authorized existing lesson in viewer mode, and that the editor class is applied only after activating it.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @club/web test -- src/features/learning/learningArchive.test.ts`

Expected: FAIL because the action and route-derived rendering are absent.

- [ ] **Step 3: Add the task-header action**

Use the existing `TaskScreen` action slot:

```vue
<template v-if="canManageModules && selectedLessonItem && !isLessonEditorMode" #actions>
  <button class="lesson-header-edit ui-icon-button" type="button" aria-label="Редактировать урок" @click="openLessonEditor">
    <Pencil aria-hidden="true" />
    <span>Редактировать</span>
  </button>
</template>
```

Render `.lesson-viewer-content` whenever `selectedLessonItem && !isLessonEditorMode`, render `.lesson-editor-form` only for `isLessonEditorMode`, and apply modal view/edit classes using the same state.

- [ ] **Step 4: Add compact responsive styling**

Style the action with existing semantic colors, a minimum 44 px tap target, a compact text label at normal mobile widths, and an icon-only fallback at 320 px while preserving the accessible name.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `pnpm --filter @club/web test -- src/features/learning/learningArchive.test.ts`

Expected: PASS.

### Task 3: Save transition, release metadata, and regression verification

**Files:**
- Modify: `apps/web/src/features/learning/LearningSection.vue`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Test: `apps/web/src/features/app/releaseNotes.test.ts`
- Test: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Consumes: existing successful `saveLesson` result handling.
- Produces: return-to-viewer behavior and the next application/cache version.

- [ ] **Step 1: Add a failing successful-save transition test**

Open an existing lesson as owner, enter editor mode, save, and assert that viewer content is rendered while the selected lesson remains open.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @club/web test -- src/features/learning/learningArchive.test.ts`

Expected: FAIL because the current successful save closes the lesson task.

- [ ] **Step 3: Return to viewer only after successful save**

After the existing lesson data is updated successfully, navigate to `/learning/lessons/:id`. Keep existing error paths unchanged so failed saves leave the editor and form state intact. Continue closing the task after successful creation of a new lesson.

- [ ] **Step 4: Update release metadata**

Bump the application from `4.62` to `4.63`, increment the service-worker cache from `club-pwa-v161` to `club-pwa-v162`, and add RU/EN release notes describing view-first administration.

- [ ] **Step 5: Run full verification**

Run:

```bash
pnpm check
pnpm test
pnpm build
```

Expected: all commands exit with code 0.

- [ ] **Step 6: Visual review**

Verify widths 320, 390, 768, 1024, and 1440 px. Confirm no horizontal overflow, a minimum 44 px edit target, correct viewer/editor transitions, and unchanged member presentation.
