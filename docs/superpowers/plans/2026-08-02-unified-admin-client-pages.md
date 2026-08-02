# Unified Admin Client Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Привести все дочерние страницы карточки клиента к единому компактному стандарту и закрыть стандарт автоматическими визуальными проверками.

**Architecture:** Сохраняем существующую маршрутизацию и данные. Перерабатываем только разметку и scoped-стили отдельного экрана результата, а общий стандарт фиксируем компонентными и E2E-проверками всех клиентских маршрутов.

**Tech Stack:** Vue 3, TypeScript, Vitest, Playwright, CSS.

## Global Constraints

- Не менять API, права доступа и бизнес-условия сброса результата.
- Интерактивные элементы имеют высоту не меньше 44 px.
- На ширинах 320–1440 px нет горизонтального переполнения.
- Рабочая публикация выполняется только в `club2.myn8nservertest.ru`.

---

### Task 1: Зафиксировать компактный контракт результата

**Files:**
- Modify: `apps/web/src/features/admin/adminAssessmentResultTask.test.ts`
- Modify: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: существующие DOM-классы `AdminAssessmentResultTask` и клиентские маршруты.
- Produces: проверки компактной структуры, размеров и отсутствия переполнения.

- [ ] **Step 1: Write the failing tests** — добавить проверки плоской структуры, единой полосы метрик, 44 px вариантов и responsive-аудита всех страниц.
- [ ] **Step 2: Run tests to verify they fail** — `pnpm --filter @club/web test -- adminAssessmentResultTask.test.ts`.
- [ ] **Step 3: Keep the failure focused** — убедиться, что падение связано только со старой крупной разметкой результата.

### Task 2: Унифицировать результат теста и ДЗ

**Files:**
- Modify: `apps/web/src/features/admin/AdminAssessmentResultTask.vue`

**Interfaces:**
- Consumes: `AdminAssessmentResult`, `resetAvailable`, `optionClass`.
- Produces: тот же `back` и `reset`, компактная адаптивная разметка.

- [ ] **Step 1: Implement the compact layout** — убрать вложенные `ui-card`, собрать статус и показатели в плотные поверхности, уменьшить типографику и пиктограммы.
- [ ] **Step 2: Preserve semantic states** — сохранить отдельные состояния выбранного, правильного и ошибочного ответа, комментарий, вложения и историю сброса.
- [ ] **Step 3: Run component tests** — `pnpm --filter @club/web test -- adminAssessmentResultTask.test.ts adminClientLearningSection.test.ts adminClientDetailTask.test.ts`.

### Task 3: Проверить все связанные страницы и выпуск

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: version/cache files discovered by existing release tests.

**Interfaces:**
- Consumes: клиентские route fixtures и production release workflow.
- Produces: версия 5.97, проверенная и опубликованная сборка.

- [ ] **Step 1: Run responsive E2E audit** — проверить 10 маршрутов на 320, 390, 768, 1024 и 1440 px, сохранить снимки результата.
- [ ] **Step 2: Inspect screenshots** — визуально проверить Pine Teal и исправить найденные отклонения.
- [ ] **Step 3: Bump release metadata** — версия 5.97 и следующий cache key согласно текущему формату проекта.
- [ ] **Step 4: Run full verification** — `pnpm check`, `pnpm test`, `pnpm build` и целевые E2E.
- [ ] **Step 5: Review, merge and deploy** — выполнить review, fast-forward в `main`, push, дождаться успешного workflow и проверить рабочий домен.
