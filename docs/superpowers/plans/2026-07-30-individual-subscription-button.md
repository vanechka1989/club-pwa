# Individual Subscription Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать персональную платёжную кнопку явно платной по смыслу.

**Architecture:** Меняется только представление `AdminIndividualOfferCard`: импорт иконки, подпись кнопки и локальные scoped-стили. Платёжная логика, API и модальное окно остаются без изменений.

**Tech Stack:** Vue 3, TypeScript, Lucide Vue, scoped CSS, Vitest.

## Global Constraints

- Текст кнопки — «Индивидуальная подписка».
- Иконка — `Banknote`, без `Gift`.
- Две основные кнопки остаются в одном ряду на телефоне.
- Логика создания платёжной ссылки не меняется.

---

### Task 1: Paid individual subscription affordance

**Files:**
- Modify: `apps/web/src/features/admin/AdminIndividualOfferCard.vue`
- Test: `apps/web/src/features/billing/individualPaymentOffersUi.test.ts`

**Interfaces:**
- Consumes: существующий обработчик `show` и prop `disabled`.
- Produces: кнопка с `Banknote`, подписью «Индивидуальная подписка» и переносом текста.

- [ ] **Step 1: Write the failing test**

Проверить импорт `Banknote`, отсутствие `Gift`, точный текст и CSS-свойства `white-space: normal`, `line-height: 1.1`, `text-align: center` для подписи.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @club/web test -- individualPaymentOffersUi.test.ts`

Expected: FAIL, поскольку компонент всё ещё использует подарок и подпись «Подписка».

- [ ] **Step 3: Write minimal implementation**

Заменить `Gift` на `Banknote`, обернуть текст в `span`, установить новый текст и добавить перенос подписи в scoped CSS.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @club/web test -- individualPaymentOffersUi.test.ts`

Expected: PASS.

- [ ] **Step 5: Verify and release**

Обновить версию PWA и service worker через failing release tests. Затем выполнить `pnpm check`, `pnpm test`, `pnpm build`, `pnpm test:e2e:release` и выпустить коммит `fix(admin): clarify individual subscription payment`.
