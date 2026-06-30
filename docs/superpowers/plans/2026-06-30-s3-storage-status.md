# S3 Storage Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show primary and reserve S3 as separate status controls on the admin storage landing card.

**Architecture:** Keep this as a frontend-only change inside the existing admin section component. Reuse the current storage action cards and modals; the new status controls only expose the two S3 connection states and point users toward the existing actions.

**Tech Stack:** Vue 3 single-file component, Vitest source-level tests, existing CSS in `AdminSection.vue`.

---

### Task 1: Storage Status UI

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Test: `apps/web/src/features/admin/adminStorageSection.test.ts`

- [ ] **Step 1: Write the failing test**

Add expectations to `apps/web/src/features/admin/adminStorageSection.test.ts`:

```ts
expect(adminSectionSource).toContain("S3 основное");
expect(adminSectionSource).toContain("S3 резервное");
expect(adminSectionSource).toContain("storageSettings?.reserveConfigured");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/web test -- adminStorageSection.test.ts`

Expected: FAIL because the component does not yet contain `S3 основное` and `S3 резервное`.

- [ ] **Step 3: Implement minimal UI**

In `apps/web/src/features/admin/AdminSection.vue`, replace the single storage status badge with a two-item status grid. Primary uses `storageSettings?.configured`; reserve uses `storageSettings?.reserveConfigured`. Both controls call a small helper that focuses the existing storage action cards.

- [ ] **Step 4: Add focused styling**

In the same component style block, add compact two-column styles for the status grid and keep the mobile layout readable with wrapping or one-column fallback if the existing media queries require it.

- [ ] **Step 5: Run focused test**

Run: `pnpm --filter @club/web test -- adminStorageSection.test.ts`

Expected: PASS.

- [ ] **Step 6: Run broader web verification**

Run: `pnpm --filter @club/web test`

Expected: PASS.
