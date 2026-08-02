# Compact Admin Client Detail Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать обучение и остальные отдельные страницы клиента визуально компактными и единообразными с основной карточкой клиента.

**Architecture:** Существующие компоненты, данные и события сохраняются. `AdminClientLearningSection.vue` получает плотную сводку и строки, а `AdminClientDetailTask.vue` — общий бескарточный контейнер для остальных разделов. Изменения ограничены шаблонами и scoped-стилями.

**Tech Stack:** Vue 3, TypeScript, scoped CSS, Vitest, Testing Library, Playwright, pnpm.

## Global Constraints

- Не менять API, данные, права или бизнес-логику.
- Визуальная иконка события: 32×32 px; SVG: 16–18 px.
- Минимальная активная область интерактивной строки или фильтра: 44 px.
- Проверяемые ширины: 320, 390, 768, 1024 и 1440 px.
- Production target: `club2.myn8nservertest.ru`, `2.27.28.89`, `/opt/club-pwa`.

---

### Task 1: Compact learning page

**Files:**
- Modify: `apps/web/src/features/admin/AdminClientLearningSection.vue`
- Test: `apps/web/src/features/admin/adminClientLearningTask.test.ts`

**Interfaces:**
- Consumes: existing `engagement`, `assessments`, `canManage`, format callbacks.
- Produces: unchanged `open-result` event.

- [ ] **Step 1: Write a failing source-level style test** asserting a flat root without `ui-card`, a compact summary, 32 px event icons, and event rows with at least 56 px height.
- [ ] **Step 2: Run** `pnpm --filter @club/web test -- adminClientLearningTask.test.ts` and confirm failure is caused by the old large layout.
- [ ] **Step 3: Update the template and scoped styles** to use the compact summary, filter and event rows while preserving bindings and events.
- [ ] **Step 4: Run the focused test** and confirm it passes.

### Task 2: Shared density for all detail pages

**Files:**
- Modify: `apps/web/src/features/admin/AdminClientDetailTask.vue`
- Test: `apps/web/src/features/admin/adminClientDetailTask.test.ts`

**Interfaces:**
- Consumes: existing section props and action events.
- Produces: unchanged `back`, `revoke-mute`, and `copy-device-info` events.

- [ ] **Step 1: Write a failing test** asserting that the outer content section is not a nested `ui-card` and uses the compact page class.
- [ ] **Step 2: Run** `pnpm --filter @club/web test -- adminClientDetailTask.test.ts` and confirm it fails against the old wrapper.
- [ ] **Step 3: Remove the nested card class and add compact local spacing/list overrides** without altering any conditional rendering or actions.
- [ ] **Step 4: Run both focused component tests** and confirm they pass.

### Task 3: Release and verification

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Test: existing release/PWA tests and responsive Playwright flows.

**Interfaces:**
- Produces: next application version, release note and service-worker cache id.

- [ ] **Step 1: Add failing release assertions** for the new version and compact client pages.
- [ ] **Step 2: Update release metadata and cache id** with concise user-facing copy.
- [ ] **Step 3: Run focused component and release tests**, then `pnpm test`, `pnpm check`, and `pnpm build`.
- [ ] **Step 4: Capture and inspect authenticated client-detail screenshots** at 320, 390, 768, 1024 and 1440 px; fix overflow, clipping and inconsistent density.
- [ ] **Step 5: Commit, merge into `main`, push once and wait for the normal GitHub deployment workflow.**
- [ ] **Step 6: Verify production health, readiness, exact deployed commit, public version/cache and release notification** only on `/opt/club-pwa` at `2.27.28.89`.
