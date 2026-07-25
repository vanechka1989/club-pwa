# Payment Product Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Исправить создание тарифов, сделать выбор платёжной системы одиночным, управлять каталогом Lava и уведомлять владельца после успешной выкладки.

**Architecture:** Существующий массив привязок сохраняется для совместимости, но UI и API допускают ровно одну включённую запись. Каталог Lava получает постоянный признак доступности, а deployment после health-check запускает идемпотентный сервис уведомления владельца.

**Tech Stack:** Vue 3, TypeScript, Hono, Drizzle ORM, PostgreSQL, Vitest, Playwright, Bash deployment.

## Global Constraints

- Мобильная вёрстка не должна иметь горизонтального переполнения от 320 px.
- Все интерактивные элементы имеют область нажатия не меньше 44 × 44 px.
- Новые товары Lava доступны по умолчанию, решение владельца для существующих товаров синхронизация не перезаписывает.
- В тарифе включена ровно одна платёжная система.
- Уведомление о релизе создаётся только после успешной проверки production и не дублируется.

---

### Task 1: Одиночная платёжная система

**Files:**
- Modify: `apps/web/src/features/billing/PaymentProductBindings.vue`
- Modify: `apps/web/src/features/billing/PaymentProductBindings.test.ts`
- Modify: `apps/api/src/routes/payments.ts`
- Test: `apps/api/src/payments/paymentProductBindings.test.ts`

**Interfaces:**
- Consumes: `PaymentProductProviderBinding[]`
- Produces: массив из двух записей, у которого ровно одна `enabled: true`

- [ ] Написать тест выбора Lava, который ожидает отключение Prodamus.
- [ ] Запустить тест и подтвердить ожидаемое падение.
- [ ] Заменить checkbox на radio и реализовать взаимоисключающий выбор.
- [ ] Добавить серверную функцию проверки ровно одной включённой привязки и тесты для 0, 1 и 2 записей.
- [ ] Запустить целевые тесты.

### Task 2: Управляемый каталог Lava

**Files:**
- Create: `apps/api/drizzle/0055_lava_catalog_selection.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Modify: `apps/api/src/db/schema.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/routes/payments.ts`
- Modify: `apps/web/src/api/client.ts`
- Create: `apps/web/src/features/billing/LavaCatalogList.vue`
- Create: `apps/web/src/features/billing/LavaCatalogList.test.ts`
- Modify: `apps/web/src/features/billing/PaymentProductBindings.vue`
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`

**Interfaces:**
- Produces: `PaymentProviderCatalogItem.isSelectable: boolean`
- Produces: `updateLavaCatalogItemSelection(id, isSelectable)`

- [ ] Добавить падающие schema/component тесты для `isSelectable`.
- [ ] Добавить миграцию и поле Drizzle.
- [ ] Возвращать поле из каталога и добавить endpoint обновления.
- [ ] Показать каталог с компактными переключателями на вкладке Lava.
- [ ] Фильтровать товары в форме тарифа, сохраняя текущую привязку при редактировании.
- [ ] Запустить целевые тесты.

### Task 3: Навигация и компактные настройки

**Files:**
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Test: `apps/web/src/features/billing/paymentProviderStyle.test.ts`

**Interfaces:**
- Produces: верхний плюс вызывает `openProductModal()`

- [ ] Добавить падающий UI-тест нового назначения верхнего плюса и компактного switch.
- [ ] Переназначить кнопку и заменить крупный checkbox кастомным компактным переключателем.
- [ ] Проверить экран на ширинах 320 и 390 px.

### Task 4: Уведомление после успешного релиза

**Files:**
- Create: `apps/api/src/deploy/releaseNotification.ts`
- Create: `apps/api/src/deploy/releaseNotification.test.ts`
- Create: `apps/api/src/deploy/notifyRelease.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `deploy/update-worker.sh`

**Interfaces:**
- Produces: `currentRelease`
- Produces: `ensureOwnerReleaseNotification(release, dependencies)`

- [ ] Написать падающие тесты создания и дедупликации уведомления.
- [ ] Создать общий объект текущего релиза и сервис уведомления.
- [ ] Добавить CLI-команду и запуск после production health-check.
- [ ] Обновить release notes и версию.
- [ ] Запустить целевые тесты.

### Task 5: Полная проверка и публикация

**Files:**
- Verify all modified files

- [ ] Выполнить `pnpm check`.
- [ ] Выполнить `pnpm test`.
- [ ] Выполнить `pnpm build`.
- [ ] Выполнить release и device Playwright-наборы.
- [ ] Проверить `git diff --check`.
- [ ] Зафиксировать изменения, отправить `main`, дождаться deployment.
- [ ] Проверить production health, ready, версию, контейнеры и появление системного уведомления владельцу.
