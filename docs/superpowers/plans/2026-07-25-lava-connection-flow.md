# Lava Connection Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Разделить подключение Lava и работу с каталогом, показывая webhook URL ещё до сохранения ключей.

**Architecture:** Сервер добавляет готовые Lava webhook URL в ответ списка провайдеров. Отдельный компонент вкладок управляет доступностью второго этапа, а `PaymentsSection.vue` сохраняет активную вкладку и переключает её после подключения.

**Tech Stack:** Vue 3, TypeScript, Hono, Zod, Vitest, Testing Library, Playwright.

## Global Constraints

- Секреты не должны возвращаться из API или попадать в журналы.
- Вкладка проверки недоступна до сохранения API-ключа и ключа webhook.
- Интерфейс не должен иметь горизонтального переполнения от 320 до 1440 px.
- Prodamus и клиентский сценарий оплаты не меняются.

---

### Task 1: Webhook URL до подключения

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/paymentProviders.test.ts`
- Modify: `apps/api/src/routes/payments.ts`

**Interfaces:**
- Produces: `AdminPaymentProvidersResponse.lavaWebhookUrls: { payment: string; subscription: string }`

- [ ] **Step 1: Write the failing contract test**

Добавить разбор ответа:

```ts
adminPaymentProvidersResponseSchema.parse({
  providers: [],
  lavaWebhookUrls: {
    payment: "https://club.example/api/payments/lava/webhook/payment",
    subscription: "https://club.example/api/payments/lava/webhook/subscription"
  }
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `pnpm --filter @club/shared test -- src/paymentProviders.test.ts`

Expected: FAIL, поле `lavaWebhookUrls` отсутствует в разобранном результате.

- [ ] **Step 3: Extend the schema and route**

Добавить обязательный объект `lavaWebhookUrls` в `adminPaymentProvidersResponseSchema` и вернуть `lavaWebhookUrls(env.WEB_ORIGIN)` из `/admin/providers`.

- [ ] **Step 4: Run the contract and API type checks**

Run: `pnpm --filter @club/shared test -- src/paymentProviders.test.ts && pnpm --filter @club/api check`

Expected: PASS.

### Task 2: Двухэтапный экран Lava

**Files:**
- Create: `apps/web/src/features/billing/LavaProviderTabs.vue`
- Create: `apps/web/src/features/billing/LavaProviderTabs.test.ts`
- Modify: `apps/web/src/features/billing/PaymentProviderSettings.vue`
- Modify: `apps/web/src/features/billing/PaymentProviderSettings.test.ts`
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`

**Interfaces:**
- Consumes: `lavaWebhookUrls` из ответа API.
- Produces: `v-model` со значениями `"connection" | "catalog"` и заблокированную вкладку каталога.

- [ ] **Step 1: Write failing component tests**

Проверить, что URL видны без провайдера, вкладка каталога заблокирована до подключения и доступна после него.

- [ ] **Step 2: Run tests and verify they fail**

Run: `pnpm --filter @club/web test -- src/features/billing/LavaProviderTabs.test.ts src/features/billing/PaymentProviderSettings.test.ts`

Expected: FAIL до создания компонента и новых props.

- [ ] **Step 3: Implement tabs and progressive disclosure**

Создать мобильные вкладки с 44 px зонами нажатия. В `PaymentsSection.vue` показывать ключи и URL только на первой вкладке, а проверку и синхронизацию — только на второй. После сохранения установить `lavaProviderTab.value = "catalog"` и не закрывать экран.

- [ ] **Step 4: Run focused tests and web type check**

Run: `pnpm --filter @club/web test -- src/features/billing/LavaProviderTabs.test.ts src/features/billing/PaymentProviderSettings.test.ts && pnpm --filter @club/web check`

Expected: PASS.

### Task 3: Release and verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`

- [ ] **Step 1: Add a failing release test for version 5.55**

Проверить заголовок `Понятное подключение Lava`.

- [ ] **Step 2: Update version and release notes**

Опубликовать версию 5.55 с описанием двух вкладок и готовых webhook URL.

- [ ] **Step 3: Run complete verification**

Run: `pnpm check && pnpm test && pnpm build && git diff --check`

Expected: все команды завершаются с кодом 0.

- [ ] **Step 4: Verify mobile layouts**

Проверить отсутствие переполнения и наложений на ширинах 320, 390, 768, 1024 и 1440 px.

- [ ] **Step 5: Commit, push and deploy**

Commit: `feat: clarify Lava connection flow`

После выкладки проверить `/api/health`, `/api/ready`, версию 5.55 и состояние контейнеров.
