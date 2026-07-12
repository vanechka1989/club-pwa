# Compact Admin Statistics and Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исправить отображение поставленных реакций и сделать мобильные разделы «Статистика» и «Клиенты» компактными без изменения бизнес-логики.

**Architecture:** Существующие вычисления и API остаются в `AdminSection.vue`. Представление уплотняется через сводную KPI-карточку, раскрываемые статистические блоки, быстрые фильтры и аккордеоны карточки клиента. Регрессионные source/CSS-тесты фиксируют обязательную структуру и размеры.

**Tech Stack:** Vue 3, TypeScript, CSS, Vitest, Vite.

## Global Constraints

- Сохранить все текущие административные действия и проверки прав.
- Mobile-first от 320 px, без горизонтального переполнения.
- Минимальная область нажатия основных элементов — 44 px.
- Все существующие темы используют семантические токены.

---

### Task 1: Compact message reactions

**Files:**
- Modify: `apps/web/src/features/community/community.css`
- Test: `apps/web/src/features/community/communityMediaUi.test.ts`

- [ ] Добавить падающий тест на горизонтальный `fit-content` контейнер и компактную кнопку реакции.
- [ ] Запустить focused-тест и подтвердить падение.
- [ ] Зафиксировать размеры, направление и отступы поставленных реакций.
- [ ] Повторно запустить focused-тест.

### Task 2: Compact statistics overview

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/features/admin/adminCompactLayout.test.ts`

- [ ] Добавить падающие проверки сводной KPI-карточки и раскрываемых разделов.
- [ ] Подтвердить RED focused-тестом.
- [ ] Объединить KPI визуально и сделать блоки статистики раскрываемыми.
- [ ] Удалить повторяющуюся подпись «Подробнее», сохранив переходы.
- [ ] Подтвердить GREEN focused-тестом.

### Task 3: Compact clients list and detail

**Files:**
- Modify: `apps/web/src/features/admin/AdminSection.vue`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/features/admin/adminCompactLayout.test.ts`

- [ ] Добавить падающие проверки быстрых фильтров, счётчика и компактной строки клиента.
- [ ] Подтвердить RED focused-тестом.
- [ ] Оставить поиск на первом уровне, дополнительные фильтры перенести в раскрываемую панель.
- [ ] Добавить быстрые фильтры и структурированную метаинформацию клиента.
- [ ] Свернуть вторичные секции карточки клиента в `details`.
- [ ] Подтвердить GREEN focused-тестом.

### Task 4: Release and verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/public/sw.js`
- Modify: matching release/PWA tests

- [ ] Обновить версию, release notes и cache key с тестами.
- [ ] Выполнить `pnpm test`, `pnpm check`, `pnpm build`, `git diff --check`.
- [ ] Закоммитить, отправить `main`, дождаться deploy workflow.
- [ ] Проверить production assets, service worker и `/api/health`.
