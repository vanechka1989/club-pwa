# Admin Clients Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перестроить список клиентов и отдельный экран клиента в компактный мобильный интерфейс с ясной иерархией.

**Architecture:** Сохраняется существующий `AdminSection.vue` и текущие API-контракты. Изменения ограничены семантической разметкой клиентского списка, карточки клиента и связанными адаптивными стилями; структурные требования закрепляются тестом исходников.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Vite.

## Global Constraints

- Не менять API и бизнес-логику.
- Сохранить маршрут `/admin/clients/:telegramId`.
- Использовать существующие CSS-переменные тем.
- Минимальная область нажатия — 44 × 44 px.

---

### Task 1: Структура списка и карточки клиента

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/features/admin/adminCompactLayout.test.ts`

**Interfaces:**
- Consumes: существующие `filteredUsers`, `selectedUser`, `selectedUserDetail` и обработчики доступа.
- Produces: классы `admin-client-overview`, `admin-client-list-row`, `admin-client-identity`, `admin-client-kpi-grid`.

- [ ] Добавить тест, проверяющий сводку, структурированную строку и четыре KPI отдельного экрана.
- [ ] Запустить `pnpm --filter @club/web test -- adminCompactLayout.test.ts` и получить ожидаемое падение по отсутствующим классам.
- [ ] Добавить компактную сводку и новую семантическую структуру, не меняя обработчики.
- [ ] Повторно запустить тест и получить PASS.

### Task 2: Адаптивные стили

**Files:**
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/features/admin/adminCompactLayout.test.ts`

**Interfaces:**
- Consumes: классы из Task 1 и существующие переменные `--surface`, `--border`, `--accent`, `--muted`.
- Produces: мобильная сетка, единая типографика, 44 px цели нажатия.

- [ ] Добавить проверку обязательных CSS-селекторов и мобильного правила.
- [ ] Запустить целевой тест и подтвердить ожидаемое падение.
- [ ] Реализовать стили списка, KPI, блока доступа и узкого экрана.
- [ ] Запустить целевой тест и получить PASS.

### Task 3: Релизная проверка

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/public/sw.js`
- Modify: связанные тесты версии и service worker.

**Interfaces:**
- Produces: новая версия приложения и новый cache name.

- [ ] Сначала обновить ожидания тестов версии и кэша и подтвердить их падение.
- [ ] Обновить номер версии, release notes и cache name.
- [ ] Запустить полный `pnpm test`, `pnpm check`, `pnpm build` и `git diff --check`.
- [ ] Проверить мобильный экран в браузере, затем закоммитить, отправить и проверить production.
