# Dedicated Error Task Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Открывать каждый инцидент центра ошибок на отдельной полноэкранной странице с собственным URL и действиями управления.

**Architecture:** `AdminErrorTracker` становится list/detail-компонентом с управляемым `errorId`; detail рендерится через существующий `TaskScreen portal`. `AdminServerPanel` связывает компонент с Vue Router, а уведомления получают прямой маршрут инцидента.

**Tech Stack:** Vue 3, Vue Router, TypeScript, Vitest, Testing Library, Playwright.

## Global Constraints

- Сохранить старые ссылки `/admin/server/logs?error=<id>`.
- Не менять API-контракты и схему базы данных.
- Все основные действия должны иметь зону нажатия не меньше 44 px.
- Проверить ширины 320, 390, 768, 1024 и 1440 px.

---

### Task 1: Управляемый полноэкранный detail

**Files:**
- Modify: `apps/web/src/features/admin/AdminErrorTracker.vue`
- Modify: `apps/web/src/features/admin/adminErrorTracker.test.ts`

**Interfaces:**
- Consumes: prop `errorId?: string | null`.
- Produces: emits `open-error(id: string)` and `close-error()`.

- [ ] **Step 1: Write failing component tests** that expect an incident click to emit `open-error`, no inline detail, and an `errorId` prop to render a portal TaskScreen with Back/status/copy controls.
- [ ] **Step 2: Run** `pnpm --filter @club/web test -- src/features/admin/adminErrorTracker.test.ts` and confirm failure is caused by missing props/emits/task screen.
- [ ] **Step 3: Implement the controlled detail contract** with:

```ts
const props = defineProps<{ errorId?: string | null }>();
const emit = defineEmits<{ "open-error": [id: string]; "close-error": [] }>();
watch(() => props.errorId, loadSelectedError, { immediate: true });
```

and replace the inline `<section>` with `<TaskScreen portal title="Ошибка" ... @back="emit('close-error')">`.
- [ ] **Step 4: Run focused tests** and confirm they pass.

### Task 2: Route integration and notification links

**Files:**
- Modify: `apps/web/src/features/app/taskNavigation.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/AdminServerPanel.vue`
- Modify: `apps/api/src/errorTracker/notifications.ts`
- Modify: `apps/api/src/errorTracker/notifications.test.ts`
- Modify: relevant navigation tests.

**Interfaces:**
- Produces route `/admin/server/errors/:errorId`.
- Preserves legacy query `error` on `/admin/server/logs`.

- [ ] **Step 1: Write failing tests** expecting the new task route, direct notification URL, route-to-prop mapping and back navigation.
- [ ] **Step 2: Run focused tests** and verify expected failures.
- [ ] **Step 3: Add route wiring** equivalent to:

```ts
const errorId = computed(() => String(route.params.errorId || route.query.error || "") || null);
const openError = (id: string) => router.push(`/admin/server/errors/${encodeURIComponent(id)}`);
const closeError = () => router.push("/admin/server/logs");
```

and change notification links to `/admin/server/errors/${group.id}`.
- [ ] **Step 4: Run focused tests** and confirm they pass.

### Task 3: Release and production verification

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Produces next release and service-worker cache revision.

- [ ] **Step 1: Add/update release expectations first**, run them red, then bump version/cache and history.
- [ ] **Step 2: Extend E2E** to open the incident task-screen and validate overflow at all target widths.
- [ ] **Step 3: Run** `pnpm check`, `pnpm test`, `pnpm build`, focused E2E and `git diff --check`.
- [ ] **Step 4: Commit, push `main`, deploy through `/opt/club-pwa/deploy/update.sh`, then verify exact commit, health, readiness, version and service-worker cache.
