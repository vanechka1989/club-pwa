# Client Source And Mailings Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать источник клиента обычным маршрутным разделом и вывести рассылки в быструю навигацию админки.

**Architecture:** Расширить существующий union клиентских разделов значением `acquisition`, переиспользовать `AdminClientAcquisition` внутри общего `AdminClientDetailTask` и заменить большую карточку компактной строкой. Для админ-навигации добавить `mailings` в существующий список основных панелей и расширить CSS-сетку до пяти колонок.

**Tech Stack:** Vue 3, TypeScript, Vitest, Testing Library, Playwright, CSS Grid.

## Global Constraints

- Не менять API и бизнес-логику получения UTM-данных.
- Сохранять существующие права доступа и маршруты админки.
- Поддерживать ширины 320, 390, 768, 1024 и 1440 px без горизонтального переполнения.

---

### Task 1: Источник клиента как маршрутный раздел

**Files:**
- Modify: `apps/web/src/features/admin/adminClientDetailSection.ts`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Modify: `apps/web/src/features/admin/AdminClientDetailTask.vue`
- Modify: `apps/web/src/features/admin/AdminClientAcquisition.vue`
- Test: `apps/web/src/features/admin/AdminClientsPanel.test.ts`
- Test: `apps/web/src/features/admin/adminClientDetailTask.test.ts`

**Interfaces:**
- Consumes: `open-client-section(section: AdminClientDetailSection)` and `getAdminUserAcquisition(telegramId)`.
- Produces: section id `acquisition` and a dedicated task titled «Источник клиента».

- [ ] **Step 1: Write failing component tests**

Add `['Источник клиента', 'acquisition']` to the compact section expectations and assert that `AdminClientDetailTask` renders the acquisition section.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @club/web test -- AdminClientsPanel.test.ts adminClientDetailTask.test.ts`

Expected: FAIL because the source is still a large inline card and `acquisition` is not a valid section.

- [ ] **Step 3: Implement the compact row and detail task**

Add `acquisition` to `adminClientDetailSections`, render a 44 px button in `AdminClientsPanel`, and render `AdminClientAcquisition` from `AdminClientDetailTask` when selected.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @club/web test -- AdminClientsPanel.test.ts adminClientDetailTask.test.ts`

Expected: PASS.

### Task 2: Рассылки в быстрой панели

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminRoute.css`
- Test: `apps/web/src/features/admin/adminCompactNavigation.test.ts`
- Test: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: `primaryAdminPanelIds`, permission-filtered `panels`.
- Produces: four primary tabs plus `More` in a five-column quick navigation grid.

- [ ] **Step 1: Write the failing navigation test**

Expect `primaryAdminPanelIds` to include `mailings`, the grid to use five equal columns, and each release viewport to expose «Рассылки» directly.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @club/web test -- adminCompactNavigation.test.ts`

Expected: FAIL because mailings are secondary and the grid has four columns.

- [ ] **Step 3: Implement the five-button grid**

Add `mailings` to `primaryAdminPanelIds`, change the grid to five columns, and tune compact mobile labels without reducing the 44 px tap target.

- [ ] **Step 4: Run tests and browser verification**

Run: `pnpm --filter @club/web test -- adminCompactNavigation.test.ts`

Run: `pnpm exec playwright test -c playwright.release.config.ts --grep "compact admin navigation|client source"`

Expected: PASS with no horizontal overflow at all target widths.

### Task 3: Release and deployment

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`

- [ ] **Step 1: Bump release metadata test-first**

Add release assertions for version `6.03` and cache `club-pwa-v275`, verify they fail, then update release metadata.

- [ ] **Step 2: Run full verification**

Run: `pnpm test`, `pnpm check`, `pnpm build`, and `pnpm test:e2e:release`.

- [ ] **Step 3: Commit, push and verify production**

Deploy the exact tested commit and confirm `/health`, `/ready`, release `6.03`, cache `v275`, and the server Git SHA.
