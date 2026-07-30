# Compact Admin Client Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разместить действия «Написать» и «Подписка» в одном равном адаптивном ряду на карточке клиента.

**Architecture:** Существующий контейнер `admin-client-primary-actions` остаётся единой точкой компоновки. Компонент подписки сохраняет всю бизнес-логику и модальное окно, но его корневой элемент и кнопка растягиваются по ячейке общей сетки.

**Tech Stack:** Vue 3, scoped CSS, Vitest, Playwright.

## Global Constraints

- Платёжная логика, API и модальное окно не меняются.
- Обе кнопки остаются в одной строке от 320 px.
- Минимальная высота интерактивной области — 48 px.
- Оформление использует текущие семантические CSS-переменные темы.

---

### Task 1: Единый ряд основных действий

**Files:**
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Modify: `apps/web/src/features/admin/AdminIndividualOfferCard.vue`
- Test: `apps/web/src/features/billing/individualPaymentOffersUi.test.ts`
- Test: `tests/e2e/app.spec.ts`

**Interfaces:**
- Consumes: существующие события `open-message` и метод `AdminIndividualOfferCard.show()`.
- Produces: контейнер `.admin-client-primary-actions` с двумя равными дочерними действиями и компактными подписями.

- [ ] **Step 1: Написать падающий компонентный тест**

Добавить проверки:

```ts
expect(panelSource).toContain('>Написать</button><AdminIndividualOfferCard')
expect(offerSource).toContain('>Подписка</button>')
expect(offerSource).toContain('.individual-offer-entry{min-width:0;width:100%}')
expect(offerSource).toContain('.individual-offer-button{width:100%')
```

- [ ] **Step 2: Запустить тест и подтвердить ожидаемое падение**

Run: `pnpm --filter @club/web exec vitest run src/features/billing/individualPaymentOffersUi.test.ts --reporter=dot`

Expected: FAIL, потому что сейчас используются подписи «Написать клиенту»/«Выдать подписку» и кнопка подписки имеет ширину по содержимому.

- [ ] **Step 3: Реализовать минимальное изменение**

В `AdminClientsPanel.vue` заменить подпись первой кнопки на `Написать` и задать общей группе двухколоночную сетку. В `AdminIndividualOfferCard.vue` заменить подпись на `Подписка`, растянуть корень и кнопку на 100%, убрать сплошной фиолетовый градиент, применить тематическую поверхность, акцентную рамку и одинаковую высоту 52 px.

- [ ] **Step 4: Запустить компонентный тест**

Run: `pnpm --filter @club/web exec vitest run src/features/billing/individualPaymentOffersUi.test.ts --reporter=dot`

Expected: PASS.

- [ ] **Step 5: Проверить мобильную геометрию**

Расширить существующий Playwright-сценарий карточки клиента проверкой двух кнопок в одной строке и отсутствия горизонтального переполнения на 320 и 390 px.

Run: `pnpm exec playwright test --config=playwright.release.config.ts --grep "client primary actions"`

Expected: PASS на мобильных проектах.

- [ ] **Step 6: Проверить проект и зафиксировать изменение**

Run: `pnpm --filter @club/web exec vitest run --reporter=dot && pnpm check && pnpm build && pnpm test:e2e:release`

Expected: все команды завершаются с кодом 0.

```bash
git add apps/web/src/features/admin/AdminClientsPanel.vue apps/web/src/features/admin/AdminIndividualOfferCard.vue apps/web/src/features/billing/individualPaymentOffersUi.test.ts tests/e2e/app.spec.ts docs/superpowers/plans/2026-07-30-admin-client-primary-actions.md
git commit -m "fix(admin): align client primary actions"
```
