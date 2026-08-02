# Finance Visual Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить существующую финансовую аналитику в адаптивный визуальный дашборд с доступными кольцевыми диаграммами и сравнительными шкалами.

**Architecture:** Данные и API остаются без изменений. Новый локальный компонент кольцевой диаграммы получает процент, подпись, значение и цветовой вариант; `AdminFinanceAnalytics.vue` собирает из него KPI, карточки систем/продуктов и удержание. Стили живут рядом с текущими admin-токенами в `adminShell.css`.

**Tech Stack:** Vue 3, TypeScript, SVG, CSS Grid, Vitest, Testing Library Vue, Playwright.

## Global Constraints

- Не добавлять библиотеку графиков и не менять финансовые формулы.
- Каждая диаграмма обязана иметь видимое точное значение и доступное имя.
- Поддержать ширины 320, 390, 768, 1024 и 1440 px и четыре темы приложения.
- Уважать `prefers-reduced-motion` и исключить горизонтальное переполнение.

---

### Task 1: Доступное кольцо

**Files:**
- Create: `apps/web/src/features/admin/AdminFinanceRing.vue`
- Create: `apps/web/src/features/admin/AdminFinanceRing.test.ts`

**Interfaces:**
- Consumes: `percent: number`, `value: string`, `label: string`, optional `tone` and `caption`.
- Produces: SVG ring with clamped progress, visible value and `aria-label`.

- [ ] **Step 1: Write the failing test** — render 64.9%, assert visible text, label and clamped SVG dash offset.
- [ ] **Step 2: Run test to verify it fails** — `pnpm --filter @club/web test -- AdminFinanceRing.test.ts`; expected missing component failure.
- [ ] **Step 3: Write minimal implementation** — implement a presentation-only SVG component with no external dependency.
- [ ] **Step 4: Run test to verify it passes** — repeat focused command; expected PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: add accessible finance ring chart"`.

### Task 2: Визуальная композиция финансов

**Files:**
- Modify: `apps/web/src/features/admin/AdminFinanceAnalytics.vue`
- Modify: `apps/web/src/features/admin/AdminFinanceAnalytics.test.ts`
- Modify: `apps/web/src/features/admin/adminShell.css`

**Interfaces:**
- Consumes: existing `AdminFinanceAnalyticsResponse` without contract changes.
- Produces: pulse KPI grid, provider/product share cards, retention overview, churn rings, stage bars and mini churn rings.

- [ ] **Step 1: Write the failing test** — assert four pulse figures, provider/product ring labels, retention ring and stage bars.
- [ ] **Step 2: Run test to verify it fails** — `pnpm --filter @club/web test -- AdminFinanceAnalytics.test.ts`; expected missing chart labels.
- [ ] **Step 3: Write minimal implementation** — restructure template using `AdminFinanceRing`; keep all exact text values as accessible fallback.
- [ ] **Step 4: Add responsive styles** — use mobile-first 2-column KPI grid, adaptive ranked cards and reduced-motion rules.
- [ ] **Step 5: Run focused tests** — both finance component tests must pass.
- [ ] **Step 6: Commit** — `git commit -m "feat: redesign finance analytics dashboard"`.

### Task 3: Адаптивная и релизная проверка

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `apps/web/public/sw.js`
- Modify: `apps/web/src/features/app/pwa.test.ts`

**Interfaces:**
- Consumes: final finance dashboard DOM and release metadata.
- Produces: regression screenshots and next patch release.

- [ ] **Step 1: Extend E2E assertions** — verify four pulse charts, chart sizes and no overflow at all release viewports.
- [ ] **Step 2: Run targeted device tests** — Android, desktop and WebKit finance analytics scenario must pass.
- [ ] **Step 3: Inspect screenshots** — review 320, 390, 768, 1024 and 1440 outputs in dark and light themes.
- [ ] **Step 4: Update release metadata** — move 6.13 to history, publish 6.14 and increment service-worker cache.
- [ ] **Step 5: Run full verification** — `pnpm test`, `pnpm check`, `pnpm build`, `pnpm test:e2e:release`, `git diff --check`.
- [ ] **Step 6: Commit and deploy** — push exact commit, deploy it to VPS, verify health/ready, cache version and CI.

