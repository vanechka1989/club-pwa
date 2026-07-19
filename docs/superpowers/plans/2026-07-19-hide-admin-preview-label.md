# Hide Admin Preview Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the visible «Вид как» caption above the admin preview-mode buttons while preserving the control and its accessible name.

**Architecture:** Delete the caption element from `AdminSection.vue` and retain `aria-label="Вид как"` on the surrounding section. Lock the distinction between visible copy and accessible copy in the existing source-level admin test, then publish version 5.19.

**Tech Stack:** Vue 3, TypeScript, Vitest, Playwright, pnpm.

## Global Constraints

- Preserve all preview-mode options, permissions, and event handlers.
- Keep `aria-label="Вид как"` for assistive technology.
- Remove only the visible `<span>Вид как</span>`.
- Publish the change as version `5.19` with Russian and English release notes.

---

### Task 1: Remove the visible preview caption

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Test: `apps/web/src/features/admin/adminStorageSection.test.ts`

**Interfaces:**
- Consumes: `.admin-preview-switcher`, `previewModeOptions`, and `ui.setPreviewMode`.
- Produces: the same preview switcher without a visible caption and with its existing accessible label.

- [ ] **Step 1: Write the failing regression assertion**

```ts
expect(adminSectionSource).toContain('class="admin-preview-switcher" aria-label="Вид как"');
expect(adminSectionSource).not.toContain("<span>Вид как</span>");
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm --filter @club/web test -- src/features/admin/adminStorageSection.test.ts`

Expected: FAIL because `<span>Вид как</span>` is still present.

- [ ] **Step 3: Remove only the caption element**

Delete this line from `AdminSection.vue`:

```vue
<span>Вид как</span>
```

Keep the surrounding `section`, its `aria-label`, the options loop, and click handlers unchanged.

- [ ] **Step 4: Verify the focused test passes**

Run: `pnpm --filter @club/web test -- src/features/admin/adminStorageSection.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the UI change**

```powershell
git add -- apps/web/src/features/admin/AdminSection.vue apps/web/src/features/admin/adminStorageSection.test.ts
git commit -m "fix(admin): hide preview mode caption"
```

### Task 2: Publish version 5.19

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Test: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Consumes: the current release-note list and localized current-release copy.
- Produces: version `5.19` and a note describing the cleaner admin preview control.

- [ ] **Step 1: Update the release test first**

Assert version `5.19`, Russian title `«Компактный переключатель ролей»`, copy containing `«Вид как»`, and English title `Compact role preview switcher`.

- [ ] **Step 2: Verify the release test fails on version 5.18**

Run: `pnpm --filter @club/web test -- src/features/app/releaseNotes.test.ts`

Expected: FAIL because the version is still `5.18`.

- [ ] **Step 3: Add the new release entry**

Set `appVersion` to `5.19`, use the current local timestamp, add the new Russian entry first, retain `5.18` immediately below it, and update the current English release copy.

- [ ] **Step 4: Verify, publish, and deploy**

Run `pnpm check`, `pnpm test`, `pnpm build`, and the targeted mobile admin Playwright checks. Commit the release metadata, merge into `main`, push explicitly with `git push origin main`, and wait for both VPS deployment and image publication to succeed for the pushed commit.
