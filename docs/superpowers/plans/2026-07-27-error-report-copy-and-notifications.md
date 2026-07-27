# Error Report Copy and Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить безопасное копирование диагностического отчёта и улучшить push/email-уведомления центра ошибок.

**Architecture:** Общий модуль форматирования формирует очищенный текстовый отчёт и данные уведомлений из `StoredErrorGroup` и последнего occurrence. API email/push использует этот формат, а Vue-компонент формирует эквивалентный клиентский отчёт из уже полученного detail response и копирует его с fallback.

**Tech Stack:** TypeScript, Vue 3, Hono, Vitest, Testing Library, Playwright, inline HTML email.

## Global Constraints

- Не изменять схему базы данных и существующие API-контракты.
- Не включать в отчёты пароли, токены, API-ключи, подписи и email-адреса.
- Сохранить независимую доставку push и email и текущую дедупликацию событий.
- Минимальная зона нажатия интерактивных элементов — 44×44 px.
- Проверить ширины 320, 390, 768, 1024 и 1440 px.

---

### Task 1: Безопасный формат диагностического отчёта

**Files:**
- Create: `apps/api/src/errorTracker/report.ts`
- Create: `apps/api/src/errorTracker/report.test.ts`
- Modify: `apps/api/src/errorTracker/notifications.ts`
- Test: `apps/api/src/errorTracker/notifications.test.ts`

**Interfaces:**
- Produces: `redactDiagnosticText(value: string): string`, `buildErrorDiagnosticReport(group: StoredErrorGroup): string`.
- Consumes: `StoredErrorGroup` from `apps/api/src/errorTracker/store.ts`.

- [ ] **Step 1: Write failing tests** for stable report labels, section/version/count fields, secret and email redaction, branded HTML structure, safe escaping, push title/body/url.
- [ ] **Step 2: Run focused tests** with `pnpm --filter @club/api test -- report.test.ts notifications.test.ts` and confirm failures are caused by missing report formatting/new markup.
- [ ] **Step 3: Implement minimal formatter and notification markup** using only escaped inline HTML, a severity accent, summary cells, diagnostic block and CTA URL.
- [ ] **Step 4: Run focused tests** and confirm both files pass.

### Task 2: Копирование в карточке администратора

**Files:**
- Create: `apps/web/src/features/admin/errorReport.ts`
- Create: `apps/web/src/features/admin/errorReport.test.ts`
- Modify: `apps/web/src/features/admin/AdminErrorTracker.vue`
- Modify: `apps/web/src/features/admin/adminErrorTracker.test.ts`

**Interfaces:**
- Produces: `buildAdminErrorReport(detail: AdminErrorTrackerDetailResponse): string`, `copyText(value: string): Promise<void>`.
- Consumes: current `selected` detail response with group, occurrences and deliveries.

- [ ] **Step 1: Write failing tests** asserting the complete copied report, redaction, clipboard call, fallback behavior, copy buttons and success feedback.
- [ ] **Step 2: Run focused web tests** with `pnpm --filter @club/web test -- errorReport.test.ts adminErrorTracker.test.ts` and confirm expected failures.
- [ ] **Step 3: Implement formatter and accessible copy controls**: primary «Скопировать отчёт», technical ID copy button, 44 px targets and non-blocking confirmation.
- [ ] **Step 4: Run focused tests** and confirm they pass.

### Task 3: Release, responsive verification and deployment

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/public/sw.js`
- Modify: release/PWA tests that assert the current version.
- Modify: `tests/e2e/app.spec.ts` only if a dedicated visual state is needed.

**Interfaces:**
- Produces: next application release and service-worker cache revision.

- [ ] **Step 1: Update failing release expectations**, run them, then bump the release and cache revision.
- [ ] **Step 2: Run focused E2E screenshots** at 320, 390, 768, 1024 and 1440 px; verify no overflow, clipping or bottom-nav overlap.
- [ ] **Step 3: Run full verification**: `pnpm check`, `pnpm test`, `pnpm build`, `git diff --check`.
- [ ] **Step 4: Commit implementation**, push `main`, deploy with `/opt/club-pwa/deploy/update.sh` and verify exact commit, `/api/health`, `/api/ready`, release and SW cache.
- [ ] **Step 5: Create one test incident only if needed for delivery validation**, confirm push/email delivery records, then mark it resolved to avoid leaving a false active incident.
