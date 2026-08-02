# Admin Analytics Visual Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить на главный экран админской аналитики три интерактивные кольцевые KPI-диаграммы для клиентов, оплат и обучения.

**Architecture:** Чистый TypeScript-helper рассчитывает долю успешных оплат. `AdminSection.vue` использует существующий `adminStatistics` и формирует единый обзорный блок; кольца рисуются CSS `conic-gradient` без новой зависимости и ведут в существующие detail-экраны.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Playwright, pnpm.

## Global Constraints

- Не изменять API, бизнес-логику, маршруты и контракты данных.
- Не добавлять библиотеку диаграмм.
- Минимальная зона нажатия каждой диаграммы: 44 px.
- Поддержать четыре существующие темы, `prefers-reduced-motion` и ширины 320, 390, 768, 1024 и 1440 px.
- Не допускать горизонтальной прокрутки и вложенных карточек.
- Production target: `club2.myn8nservertest.ru`, `2.27.28.89`, `/opt/club-pwa`.

---

### Task 1: Расчёт и структура визуального обзора

**Files:**
- Create: `apps/web/src/features/admin/adminAnalyticsOverview.ts`
- Create: `apps/web/src/features/admin/adminAnalyticsOverview.test.ts`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminStatisticsNavigation.test.ts`

**Interfaces:**
- Produces: `paymentSuccessPercent(paidOrders: number, pendingOrders: number, failedOrders: number): number`.
- Consumes: `adminStatistics.clients.activePercent`, `adminStatistics.payments.*Orders`, `adminStatistics.learning.averageProgressPercent` and existing `openStatisticsDetail`.

- [ ] **Step 1: Write the failing helper test.**

```ts
expect(paymentSuccessPercent(8, 1, 1)).toBe(80);
expect(paymentSuccessPercent(0, 0, 0)).toBe(0);
expect(paymentSuccessPercent(12, -1, -1)).toBe(100);
```

- [ ] **Step 2: Extend the failing structure test** to require `admin-stat-visual-grid`, exactly three `admin-stat-visual-action` buttons, accessible percentage labels, and navigation to `clients`, `finance`, and `learning`.

- [ ] **Step 3: Run** `pnpm --filter @club/web test -- adminAnalyticsOverview.test.ts adminStatisticsNavigation.test.ts` and confirm failures are caused by the missing helper and visual overview.

- [ ] **Step 4: Implement the helper.**

```ts
export function paymentSuccessPercent(paidOrders: number, pendingOrders: number, failedOrders: number) {
  const paid = Math.max(0, paidOrders);
  const total = paid + Math.max(0, pendingOrders) + Math.max(0, failedOrders);
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round((paid / total) * 100)));
}
```

- [ ] **Step 5: Implement the overview markup** as one `ui-card` with two absolute KPI columns followed by three buttons. Each button sets `--chart-value`, shows the percentage and absolute context, has an `aria-label`, and calls `openStatisticsDetail('clients' | 'finance' | 'learning')`.

- [ ] **Step 6: Run the focused tests** and confirm they pass.

- [ ] **Step 7: Commit** with `feat: add visual admin analytics overview`.

### Task 2: Responsive rings and browser verification

**Files:**
- Modify: `apps/web/src/features/admin/adminShell.css`
- Modify: `apps/web/src/features/admin/adminRoute.css`
- Modify: `apps/web/src/features/admin/adminStatisticsNavigation.test.ts`
- Test: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: `.admin-stat-visual-grid`, `.admin-stat-visual-action`, `.admin-stat-ring`, `--chart-value`, and semantic theme variables.
- Produces: responsive, focus-visible, reduced-motion-safe ring presentation.

- [ ] **Step 1: Add failing style assertions** for `conic-gradient`, three-column layout, visible focus state, compact `max-width: 359px` handling, and `prefers-reduced-motion`.

- [ ] **Step 2: Run** `pnpm --filter @club/web test -- adminStatisticsNavigation.test.ts` and confirm the new assertions fail.

- [ ] **Step 3: Add CSS** that renders each ring with a semantic accent and neutral remainder, keeps text as the source of meaning, and reduces the ring size and gaps on narrow screens.

- [ ] **Step 4: Run focused tests and build** with `pnpm --filter @club/web test -- adminStatisticsNavigation.test.ts && pnpm --filter @club/web build`.

- [ ] **Step 5: Start the local app and capture screenshots** at 320, 390, 768, 1024, and 1440 px in light and dark themes. Inspect for overflow, clipped percentages, bottom-navigation overlap, focus visibility, and correct empty-data rendering; correct defects before proceeding.

- [ ] **Step 6: Commit** with `style: polish analytics ring charts`.

### Task 3: Release and production deployment

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Test: `apps/web/src/features/app/releaseNotes.test.ts`
- Test: `apps/web/src/features/app/pwa.test.ts`
- Test: `tests/e2e/app.spec.ts`

**Interfaces:**
- Produces: next patch release after the current repository value and the next service-worker cache generation.

- [ ] **Step 1: Write failing release tests** for the new Russian/English analytics overview note and incremented cache id.

- [ ] **Step 2: Move the previous current release into `releaseHistory`, update `currentRelease` and English notes, and increment the service-worker cache exactly once.**

- [ ] **Step 3: Run complete verification:** `pnpm test`, `pnpm check`, `pnpm build`, and `pnpm test:e2e:release`.

- [ ] **Step 4: Review** `git diff --check`, the final diff, and repository status; commit the release with `release: publish visual analytics overview`.

- [ ] **Step 5: Run the mandatory read-only preflight.** Verify public DNS/IP for `club2.myn8nservertest.ru`, SSH hostname/IP `2.27.28.89`, server directory `/opt/club-pwa`, server remote URL, server HEAD/deployed marker, local `origin`, and the exact local commit. Stop on any mismatch.

- [ ] **Step 6: Push the exact `main` commit** and use only the repository's deployment workflow. If GitHub deployment is already running, wait for it; otherwise execute `DEPLOY_EXPECTED_COMMIT=<commit> DEPLOY_DIR=/opt/club-pwa bash /opt/club-pwa/deploy/update.sh` on `2.27.28.89`.

- [ ] **Step 7: Verify production** `/api/health`, `/api/ready`, root HTTP status, application release, public service-worker cache, server `HEAD`, `/var/lib/club-pwa-deploy/deployed-commit`, deployment status, and healthy compose services all correspond to the same exact commit.
