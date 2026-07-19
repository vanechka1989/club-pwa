# Profile Pencil Badge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the profile name-edit pencil the same highlighted square badge as the adjacent photo action.

**Architecture:** Reuse the existing `profile-avatar-icon-button` and `ui-icon-button` presentation classes on the name-edit button. Preserve its conditional visibility, accessible label, and click handler; verify the shared class contract in the existing source-level layout test.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Playwright, pnpm.

## Global Constraints

- Preserve all profile business logic and data contracts.
- The pencil and camera remain separate buttons with distinct accessible names.
- Each icon button keeps a minimum 44 x 44 pixel touch target.
- Publish the change as the next application version with Russian and English release notes.

---

### Task 1: Match the profile action badges

**Files:**
- Modify: `apps/web/src/features/profile/ProfileSection.vue`
- Test: `apps/web/src/features/profile/ProfileSection.layout.test.ts`

**Interfaces:**
- Consumes: existing `.profile-avatar-icon-button.ui-icon-button` styling and `openDisplayNameEditor()` handler.
- Produces: a name-edit button with classes `profile-name-edit profile-avatar-icon-button ui-icon-button`.

- [ ] **Step 1: Write the failing layout test**

Add an assertion that the pencil button uses the shared action-button classes:

```ts
expect(source).toContain(
  'class="profile-name-edit profile-avatar-icon-button ui-icon-button"'
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @club/web test -- src/features/profile/ProfileSection.layout.test.ts`

Expected: FAIL because the pencil currently has only `profile-name-edit`.

- [ ] **Step 3: Apply the shared badge classes**

Change the pencil button markup to:

```vue
<button
  v-if="!session.user?.displayNameChangedByUserAt"
  class="profile-name-edit profile-avatar-icon-button ui-icon-button"
  type="button"
  aria-label="Изменить ник"
  @click="openDisplayNameEditor"
>
  <Pencil class="h-4 w-4" aria-hidden="true" />
</button>
```

- [ ] **Step 4: Run the focused test**

Run: `pnpm --filter @club/web test -- src/features/profile/ProfileSection.layout.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the UI change**

```powershell
git add -- apps/web/src/features/profile/ProfileSection.vue apps/web/src/features/profile/ProfileSection.layout.test.ts
git commit -m "fix(profile): highlight name edit action"
```

### Task 2: Publish and verify the release

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Test: `apps/web/src/features/app/releaseNotes.test.ts`

**Interfaces:**
- Consumes: `appVersion`, `appVersionUpdatedAt`, `releaseNotes`, and localized current-release copy.
- Produces: application version `5.18` with a release note describing the matching pencil and camera badges.

- [ ] **Step 1: Write the failing release-note test**

Assert `appVersion === "5.18"`, the first Russian title is `"Единые кнопки профиля"`, and its text contains `"карандаш"` and `"камеры"`. Assert the English title is `"Consistent profile action buttons"`.

- [ ] **Step 2: Run the release-note test to verify it fails**

Run: `pnpm --filter @club/web test -- src/features/app/releaseNotes.test.ts`

Expected: FAIL because the current version is `5.17`.

- [ ] **Step 3: Add version 5.18 and preserve version 5.17**

Update `version.ts` to `5.18` with the current local timestamp. Add a new first Russian release entry describing the pencil badge, keep the prior `5.17` entry immediately below it, and update `currentEnglishRelease` with equivalent English copy.

- [ ] **Step 4: Run full verification**

Run: `pnpm check; pnpm test; pnpm build`

Expected: all commands exit 0. The existing Vite large-chunk warning is permitted.

- [ ] **Step 5: Visually verify the profile**

Run the existing targeted profile Playwright test at the 390-pixel mobile viewport and confirm the pencil and camera have matching badge geometry with no overlap or horizontal overflow.

- [ ] **Step 6: Commit and deploy**

```powershell
git add -- apps/web/src/features/app/version.ts apps/web/src/features/app/releaseNotes.ts apps/web/src/features/app/releaseNotes.test.ts
git commit -m "release: publish version 5.18"
git push origin main
```

Wait for both `Deploy to VPS` and `Публикация образов шаблонного клуба` for the pushed commit to complete successfully, then verify local `HEAD` equals `origin/main`.
