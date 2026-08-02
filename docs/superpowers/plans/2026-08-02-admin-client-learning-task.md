# Admin Client Learning Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вынести обучение клиента в отдельный экран и унифицировать компактные строки карточки клиента с иконками.

**Architecture:** `AdminClientsPanel` оставляет только навигационную кнопку и эмитит открытие обучения. Новый `AdminClientLearningTask` размещает существующий `AdminClientLearningSection` внутри `TaskScreen`, а `AdminSection` управляет маршрутами карточки, обучения и результата.

**Tech Stack:** Vue 3, TypeScript, Vue Router, Lucide Vue, Vitest, Playwright.

## Global Constraints

- Не менять API и бизнес-данные обучения.
- Сохранить действующие проверки административных прав.
- Минимальная высота интерактивной строки — 44 px.

---

### Task 1: Контракт компактной карточки

**Files:**
- Modify: `apps/web/src/features/admin/adminClientCard.test.ts`
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`

**Interfaces:**
- Produces: событие `open-learning: []`.

- [ ] Написать тест, требующий кнопку `admin-client-learning-link`, иконки всех разделов и отсутствие встроенного полного блока.
- [ ] Запустить тест и получить ожидаемое падение.
- [ ] Реализовать кнопку и иконки Lucide.
- [ ] Запустить тест до зелёного результата.

### Task 2: Самостоятельный экран и маршруты

**Files:**
- Create: `apps/web/src/features/admin/AdminClientLearningTask.vue`
- Modify: `apps/web/src/features/admin/AdminClientLearningSection.vue`
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminClientLearningEngagement.test.ts`

**Interfaces:**
- Consumes: `open-learning`, `open-result`.
- Produces: маршруты `/admin/clients/:telegramId/learning` и `/admin/clients/:telegramId/learning/:mode/:recordId`.

- [ ] Написать тест маршрута, отдельного `TaskScreen` и возврата результата к обучению.
- [ ] Запустить тест и получить ожидаемое падение.
- [ ] Создать экран, добавить маршрут и переключение экранов.
- [ ] Запустить тест до зелёного результата.

### Task 3: Выпуск и визуальная проверка

**Files:**
- Modify: `packages/shared/src/release.ts`
- Modify: `apps/web/src/features/app/releaseHistory.ts`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/public/sw.js`

**Interfaces:**
- Produces: версия `5.94` и новый cache id.

- [ ] Обновить сведения о выпуске и service worker.
- [ ] Запустить `pnpm test`, `pnpm check` и `pnpm build`.
- [ ] Проверить экран на мобильных размерах Playwright.
- [ ] Зафиксировать точный commit и развернуть только на утверждённом production после preflight.
