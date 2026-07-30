# Semantic Admin Client Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сделать действия карточки клиента однозначно различимыми по подписи, иконке и смысловому цвету.

**Architecture:** Существующая бизнес-логика и сетки сохраняются. В `AdminClientsPanel.vue` добавляются Lucide-иконки и новая подпись запрета общения, а оформление остаётся локальным для карточки клиента в `adminShell.css` и scoped-стилях `AdminIndividualOfferCard.vue`.

**Tech Stack:** Vue 3, Lucide Vue, semantic CSS variables, Vitest, Playwright.

## Global Constraints

- API, события и обработчики действий не меняются.
- «Открыть доступ» — зелёное действие, «Закрыть доступ» — красное.
- «Мут до снятия» заменяется точной подписью «Запретить общение в чате».
- «Написать» — жёлто-золотое действие с иконкой сообщения.
- «Подписка» — сиреневое действие с иконкой подарка.
- Все кнопки имеют подписи и иконки; цвет не является единственным носителем смысла.
- Основные действия остаются равными и помещаются без горизонтальной прокрутки от 320 px.

---

### Task 1: Смысловые действия карточки клиента

**Files:**
- Modify: `apps/web/src/features/admin/AdminClientsPanel.vue`
- Modify: `apps/web/src/features/admin/AdminIndividualOfferCard.vue`
- Modify: `apps/web/src/features/admin/adminShell.css`
- Test: `apps/web/src/features/admin/adminClientCard.test.ts`
- Test: `apps/web/src/features/billing/individualPaymentOffersUi.test.ts`

**Interfaces:**
- Consumes: существующие события `open-access`, `close-access`, `quick-mute`, `open-message` и метод `AdminIndividualOfferCard.show()`.
- Produces: классы `.admin-access-open`, `.admin-access-close`, `.admin-client-mute-action`, `.admin-message-client-button`, `.individual-offer-button` с различимыми семантическими состояниями.

- [ ] **Step 1: Написать падающие тесты**

Добавить исходные проверки:

```ts
expect(source).toContain("LockOpen")
expect(source).toContain("Lock")
expect(source).toContain("MessageCircleOff")
expect(source).toContain("MessageCircle")
expect(source).toContain("Запретить общение в чате")
expect(source).not.toContain("Мут до снятия")
expect(styles).toMatch(/\.admin-access-open\s*\{[^}]*background:[^}]*var\(--success\)/s)
expect(styles).toMatch(/\.admin-message-client-button\s*\{[^}]*--admin-client-action-color:\s*#f59e0b/s)
expect(adminOffer).toMatch(/\.individual-offer-button\{[^}]*--individual-offer-color:\s*#8b5cf6/s)
```

- [ ] **Step 2: Подтвердить ожидаемое падение**

Run:

```bash
pnpm --filter @club/web exec vitest run src/features/admin/adminClientCard.test.ts src/features/billing/individualPaymentOffersUi.test.ts --reporter=dot
```

Expected: FAIL на отсутствующих иконках, новой подписи и цветовых переменных.

- [ ] **Step 3: Реализовать разметку**

В импорт `lucide-vue-next` добавить `Lock`, `LockOpen`, `MessageCircle` и `MessageCircleOff`. Поместить иконки перед подписями соответствующих кнопок с `aria-hidden="true"`. Заменить `Мут до снятия` на `Запретить общение в чате`.

- [ ] **Step 4: Реализовать смысловые стили**

В `adminShell.css`:

```css
.admin-client-workspace .admin-access-open {
  background: linear-gradient(135deg, color-mix(in srgb, var(--success) 82%, #064e3b), var(--success));
  color: #fff;
}

.admin-client-workspace .admin-message-client-button {
  --admin-client-action-color: #f59e0b;
  background: linear-gradient(135deg, color-mix(in srgb, var(--admin-client-action-color) 88%, #fef3c7), #facc15);
  color: #2b1b00;
}
```

Для закрытия доступа и запрета общения использовать `var(--danger)` с разной насыщенностью. Для всех иконок задать 17–18 px, `flex: 0 0 auto`; для кнопок — `inline-flex`, центрирование и gap 8 px. В строке ручного доступа включить `grid-auto-rows: 1fr`, чтобы длинная подпись и «Сохранить» были одинаковой высоты.

В `AdminIndividualOfferCard.vue`:

```css
.individual-offer-button {
  --individual-offer-color: #8b5cf6;
  border-color: color-mix(in srgb, var(--individual-offer-color) 72%, var(--border));
  background: linear-gradient(135deg, color-mix(in srgb, var(--individual-offer-color) 88%, #4c1d95), #a855f7);
  color: #fff;
}
```

- [ ] **Step 5: Подтвердить прохождение тестов**

Run:

```bash
pnpm --filter @club/web exec vitest run src/features/admin/adminClientCard.test.ts src/features/billing/individualPaymentOffersUi.test.ts --reporter=dot
```

Expected: PASS.

- [ ] **Step 6: Проверить качество и мобильную совместимость**

Run:

```bash
pnpm --filter @club/web exec vitest run --reporter=dot
pnpm check
pnpm build
pnpm test:e2e:release
```

Expected: все команды завершаются с кодом 0; release-E2E не обнаруживает переполнения на мобильных проектах.

- [ ] **Step 7: Подготовить и развернуть релиз**

Обновить текущий релиз, историю и service-worker cache. Зафиксировать изменения, отправить `main`, дождаться зелёных Deploy/PWA/template-image workflows и проверить production `/`, `/api/health`, `/api/ready`, версию и cache name.
