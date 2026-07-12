# Admin Statistics Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить длинную страницу статистики компактным обзором и пятью полноэкранными разделами.

**Architecture:** `AdminSection.vue` сохраняет данные и drilldown-действия, но управляет выбранным detail-разделом. Отображение детализации переносится в `AdminStatisticsDetail.vue`, который получает готовые агрегаты и сообщает о переходах к клиентам и оплатам.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Vite.

## Global Constraints

- Не менять API и расчёты `buildAdminStatistics`.
- Сохранить существующие drilldown клиентов и оплат.
- Mobile-first от 320 px без горизонтальной прокрутки.
- Использовать текущие темы и `TaskScreen`.

---

### Task 1: Overview navigation

**Files:** `apps/web/src/features/admin/AdminSection.vue`, `apps/web/src/features/admin/adminStatisticsNavigation.test.ts`

- [ ] Написать падающие source-тесты для пяти навигационных строк и двух KPI периода.
- [ ] Запустить `pnpm --filter @club/web test -- adminStatisticsNavigation.test.ts` и подтвердить FAIL.
- [ ] Заменить раскрываемые карточки обзором и обработчиком `openStatisticsDetail`.
- [ ] Повторить focused-тест и подтвердить PASS.

### Task 2: Full-screen statistic details

**Files:** `apps/web/src/features/admin/AdminStatisticsDetail.vue`, `apps/web/src/features/admin/AdminSection.vue`, `apps/web/src/features/admin/adminStatisticsNavigation.test.ts`

- [ ] Добавить падающие проверки пяти detail-состояний и `TaskScreen`.
- [ ] Реализовать тип `StatisticsDetail = "clients" | "finance" | "learning" | "community" | "polls"` и detail-компонент.
- [ ] Подключить события client/payment drilldown к существующим функциям.
- [ ] Подтвердить focused PASS.

### Task 3: Mobile visual system

**Files:** `apps/web/src/styles.css`, `apps/web/src/features/admin/adminStatisticsNavigation.test.ts`

- [ ] Добавить падающие CSS-проверки сводки, предупреждений и строк навигации.
- [ ] Реализовать компактные поверхности и адаптив 320–1024 px.
- [ ] Подтвердить focused PASS.

### Task 4: Release

**Files:** version, release notes, service worker и соответствующие тесты.

- [ ] Обновить версию и cache key через RED/GREEN тесты.
- [ ] Выполнить `pnpm test`, `pnpm check`, `pnpm build`, `git diff --check`.
- [ ] Отправить `main`, дождаться deploy и проверить production assets, service worker и health.
