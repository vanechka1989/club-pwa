# Lava Payment Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить Lava как второй независимый платёжный провайдер с разовыми и рекуррентными платежами, выбором провайдера по тарифу, безопасными webhook и автоматической сверкой состояния.

**Architecture:** Существующая бизнес-логика оплаты выделяется из Prodamus-маршрута в нейтральное платёжное ядро. Prodamus и Lava реализуют единый адаптер, тарифы связываются с одним или несколькими провайдерами через отдельную таблицу, а выдача доступа выполняется единым идемпотентным обработчиком событий.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, PostgreSQL, Zod, Vue 3, Pinia, Vitest, Playwright, pnpm.

## Global Constraints

- Существующая конфигурация, товары, заказы, подписки и доступ Prodamus сохраняются без ручной перенастройки.
- Владелец проекта может включить Prodamus, Lava или оба провайдера для одного тарифа.
- Если доступен один провайдер, дополнительный выбор не показывается; если два — клиент выбирает внутри приложения.
- Доступ выдаётся только после проверенного серверного события или успешной сверки с API провайдера.
- Повторная доставка одного события не создаёт второй платёж и не продлевает доступ повторно.
- Отмена подписки не сокращает уже оплаченный период.
- Секреты не возвращаются в клиентское приложение и не записываются в логи.
- Интерфейс выбора оплаты и настройки провайдеров должен корректно помещаться на поддерживаемых Android и iPhone.
- Первый релиз сохраняет устаревшие Prodamus-столбцы для безопасного отката.

---

## File Structure

### Shared contracts

- `packages/shared/src/index.ts` — общие типы провайдеров, привязок, checkout, каталога и подписок.

### Database

- `apps/api/src/db/schema.ts` — нейтральные поля провайдеров, заказов и подписок, таблицы привязок и каталога.
- `apps/api/drizzle/0054_lava_payment_provider.sql` — расширяющая миграция и перенос текущих Prodamus-привязок.
- `apps/api/drizzle/meta/_journal.json` — регистрация миграции через Drizzle.

### Payment core and adapters

- `apps/api/src/payments/providerSecrets.ts` — versionированное шифрование ключей провайдеров.
- `apps/api/src/payments/providerAdapter.ts` — единый контракт платёжного провайдера.
- `apps/api/src/payments/providerRegistry.ts` — получение адаптера по коду провайдера.
- `apps/api/src/payments/prodamusAdapter.ts` — оболочка над существующей реализацией Prodamus.
- `apps/api/src/payments/lava.ts` — HTTP-клиент Lava, нормализация каталога и создание счёта.
- `apps/api/src/payments/lavaWebhook.ts` — проверка заголовка и преобразование webhook Lava.
- `apps/api/src/payments/paymentEventProcessor.ts` — транзакционная идемпотентная обработка платежа и доступа.
- `apps/api/src/payments/paymentReconciliation.ts` — поиск и сверка зависших заказов и подписок.

### API

- `apps/api/src/routes/payments.ts` — тонкие маршруты списка тарифов, checkout, администрирования и Prodamus.
- `apps/api/src/routes/lavaPayments.ts` — публичные webhook Lava.
- `apps/api/src/backgroundJobs.ts` — запуск и остановка сверки платежей.
- `apps/api/src/index.ts` — подключение маршрута Lava.

### Web

- `apps/web/src/api/client.ts` — вызовы настройки Lava, синхронизации каталога и checkout с провайдером.
- `apps/web/src/features/billing/PaymentProviderChooser.vue` — мобильное окно выбора способа оплаты.
- `apps/web/src/features/billing/PaymentProviderSettings.vue` — одна карточка состояния и настройки провайдера.
- `apps/web/src/features/billing/PaymentProductBindings.vue` — переключатели и внешние привязки тарифа.
- `apps/web/src/features/billing/PaymentsSection.vue` — композиция новых компонентов и существующего экрана.

---

### Task 1: Add provider-neutral database and shared contracts

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0054_lava_payment_provider.sql`
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create: `apps/api/src/payments/providerSecrets.ts`
- Create: `apps/api/src/payments/providerSecrets.test.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `deploy/install.sh`
- Modify: `deploy/server-install.sh`
- Modify: `deploy/update-worker.sh`
- Test: `apps/api/src/deploy/updateScript.test.ts`
- Test: `apps/api/src/payments/paymentSchemaMigration.test.ts`

**Interfaces:**
- Produces: `PaymentProviderCode = "prodamus" | "lava"`.
- Produces: `PaymentProductProviderBinding`, `PaymentProviderCatalogItem`, `PaymentCheckoutOption`.
- Produces database tables `paymentProductProviderBindings` and `paymentProviderCatalogItems`.
- Produces neutral fields `apiKey`, `webhookSecret`, `lastCheckedAt`, `lastCheckError`, `externalSubscriptionId`.
- Produces `encryptProviderSecret(value): string` and `decryptProviderSecret(value): string`.

- [ ] **Step 1: Write the failing shared-contract and migration tests**

```ts
import { describe, expect, it } from "vitest";
import {
  paymentCheckoutOptionsResponseSchema,
  paymentProviderSchema,
  paymentProductSchema
} from "@club/shared";

describe("provider-neutral payment contracts", () => {
  it("accepts Lava and multiple tariff bindings", () => {
    expect(paymentProviderSchema.parse({
      id: "lava-provider",
      provider: "lava",
      title: "Lava",
      isEnabled: true,
      secretConfigured: true,
      webhookSecretConfigured: true,
      connectionState: "verified",
      lastCheckedAt: "2026-07-25T10:00:00.000Z",
      lastCheckError: null,
      webhookUrls: {
        payment: "https://club.example/api/payments/lava/webhook/payment",
        subscription: "https://club.example/api/payments/lava/webhook/subscription"
      }
    }).provider).toBe("lava");

    expect(paymentProductSchema.parse({
      id: "product",
      kind: "recurrent",
      title: "Клуб",
      description: null,
      badgeLabel: null,
      amountRub: 990,
      accessDays: 30,
      bindings: [
        { provider: "prodamus", enabled: true, externalProductId: "77", externalOfferId: null },
        { provider: "lava", enabled: true, externalProductId: "product-1", externalOfferId: "offer-1" }
      ],
      isPublished: true,
      archivedUntil: null,
      createdAt: "2026-07-25T10:00:00.000Z",
      updatedAt: "2026-07-25T10:00:00.000Z"
    }).bindings).toHaveLength(2);

    expect(paymentCheckoutOptionsResponseSchema.parse({
      productId: "product",
      options: [
        { provider: "prodamus", title: "Prodamus" },
        { provider: "lava", title: "Lava" }
      ]
    }).options).toHaveLength(2);
  });
});
```

The migration test must read `0054_lava_payment_provider.sql` and assert that it:

```ts
expect(sql).toContain("payment_product_provider_bindings");
expect(sql).toContain("payment_provider_catalog_items");
expect(sql).toContain("external_subscription_id");
expect(sql).toContain("INSERT INTO \"payment_product_provider_bindings\"");
expect(sql).not.toContain("DROP COLUMN");
```

- [ ] **Step 2: Write the failing secret-storage tests**

```ts
it("encrypts with a random AES-256-GCM nonce and decrypts the value", () => {
  const first = encryptProviderSecret("lava-key");
  const second = encryptProviderSecret("lava-key");
  expect(first).toMatch(/^enc:v1:/);
  expect(second).not.toBe(first);
  expect(decryptProviderSecret(first)).toBe("lava-key");
  expect(decryptProviderSecret(second)).toBe("lava-key");
});

it("reads legacy plaintext Prodamus secrets during migration", () => {
  expect(decryptProviderSecret("legacy-prodamus-secret")).toBe("legacy-prodamus-secret");
});
```

- [ ] **Step 3: Run the focused tests and verify failure**

Run:

```powershell
pnpm --filter @club/api test -- src/payments/paymentSchemaMigration.test.ts src/payments/providerSecrets.test.ts
pnpm --filter @club/shared check
```

Expected: FAIL because the schemas, tables and migration do not exist.

- [ ] **Step 4: Add the shared types**

Define these public contracts in `packages/shared/src/index.ts`:

```ts
export const paymentProviderCodeSchema = z.enum(["prodamus", "lava"]);
export type PaymentProviderCode = z.infer<typeof paymentProviderCodeSchema>;

export const paymentProductProviderBindingSchema = z.object({
  provider: paymentProviderCodeSchema,
  enabled: z.boolean(),
  externalProductId: z.string().nullable(),
  externalOfferId: z.string().nullable()
});

export const paymentCheckoutOptionSchema = z.object({
  provider: paymentProviderCodeSchema,
  title: z.string()
});

export const paymentCheckoutOptionsResponseSchema = z.object({
  productId: z.string(),
  options: z.array(paymentCheckoutOptionSchema)
});
```

Change `paymentProviderSchema.provider` from a literal to `paymentProviderCodeSchema`, replace Prodamus-only response fields with `webhookUrls`, `connectionState`, and configured flags, and replace `paymentProductSchema.providerId` plus `prodamusSubscriptionId` with `bindings`.

- [ ] **Step 5: Add encrypted provider-secret storage**

Add a required production variable `PAYMENT_CONFIG_ENCRYPTION_KEY` containing exactly 32 random bytes in base64. Implement AES-256-GCM values in the format:

```text
enc:v1:<base64 nonce>:<base64 ciphertext>:<base64 auth tag>
```

The decryptor accepts unprefixed legacy Prodamus secrets temporarily. Provider administration always rewrites saved secrets using `enc:v1`; the deployment task encrypts the existing Prodamus secret through the application service after the new key is installed. Logs receive only stable error codes.

The install scripts preserve an existing key or generate one with `openssl rand -base64 32`. The update worker adds the variable atomically to an existing `.env` when it is absent before starting the new API image. `updateScript.test.ts` asserts that the value is preserved between deploys and is never printed.

- [ ] **Step 6: Add schema fields and additive SQL migration**

Add provider configuration columns to `paymentProviders`: nullable `apiKey`, nullable `webhookSecret`, `lastCheckedAt`, `lastCheckError`, and `lastCatalogSyncAt`. Keep `formUrl`, `secretKey`, and `sys` nullable-compatible for Lava.

Create:

```ts
export const paymentProductProviderBindings = pgTable("payment_product_provider_bindings", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id").notNull().references(() => paymentProducts.id, { onDelete: "cascade" }),
  providerId: uuid("provider_id").notNull().references(() => paymentProviders.id, { onDelete: "cascade" }),
  externalProductId: varchar("external_product_id", { length: 160 }),
  externalOfferId: varchar("external_offer_id", { length: 160 }),
  isEnabled: boolean("is_enabled").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  productProviderIdx: uniqueIndex("payment_product_provider_bindings_product_provider_idx")
    .on(table.productId, table.providerId)
}));
```

Create `paymentProviderCatalogItems` keyed by `(providerId, externalProductId, externalOfferId)` and add neutral external identifiers to orders and subscriptions. The SQL migration copies every existing product's Prodamus binding and keeps all legacy columns.

- [ ] **Step 7: Run tests and type checks**

Run:

```powershell
pnpm --filter @club/api test -- src/payments/paymentSchemaMigration.test.ts src/payments/providerSecrets.test.ts src/deploy/updateScript.test.ts
pnpm --filter @club/shared check
pnpm --filter @club/api check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add packages/shared/src/index.ts apps/api/src/db/schema.ts apps/api/drizzle apps/api/src/payments/providerSecrets.ts apps/api/src/payments/providerSecrets.test.ts apps/api/src/env.ts deploy/install.sh deploy/server-install.sh deploy/update-worker.sh apps/api/src/deploy/updateScript.test.ts
git commit -m "feat: add provider-neutral payment schema"
```

---

### Task 2: Extract the payment provider contract and preserve Prodamus

**Files:**
- Create: `apps/api/src/payments/providerAdapter.ts`
- Create: `apps/api/src/payments/providerRegistry.ts`
- Create: `apps/api/src/payments/prodamusAdapter.ts`
- Modify: `apps/api/src/routes/payments.ts`
- Test: `apps/api/src/payments/providerRegistry.test.ts`
- Test: `apps/api/src/payments/prodamusAdapter.test.ts`

**Interfaces:**
- Produces: `PaymentProviderAdapter`.
- Produces: `getPaymentProviderAdapter(code: PaymentProviderCode): PaymentProviderAdapter`.
- Consumes existing helpers from `apps/api/src/payments/prodamus.ts`.

- [ ] **Step 1: Write failing adapter contract tests**

```ts
import { describe, expect, it } from "vitest";
import { getPaymentProviderAdapter } from "./providerRegistry";

describe("payment provider registry", () => {
  it("returns the existing Prodamus adapter", () => {
    expect(getPaymentProviderAdapter("prodamus").code).toBe("prodamus");
  });

  it("fails explicitly before an adapter is registered", () => {
    expect(() => getPaymentProviderAdapter("lava")).toThrow("Payment provider adapter is not registered: lava");
  });
});
```

In `prodamusAdapter.test.ts`, call `createCheckout` with the same fixture used by `prodamus.test.ts` and assert that the generated URL still contains the existing order, notification, return, signature and subscription parameters.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
pnpm --filter @club/api test -- src/payments/providerRegistry.test.ts src/payments/prodamusAdapter.test.ts
```

Expected: FAIL because adapter files do not exist.

- [ ] **Step 3: Define the provider contract**

```ts
export type NormalizedPaymentEvent = {
  eventKey: string;
  provider: PaymentProviderCode;
  type: "payment_succeeded" | "payment_failed" | "renewal_succeeded" | "renewal_failed" | "subscription_cancelled";
  externalOrderId: string | null;
  externalPaymentId: string | null;
  externalSubscriptionId: string | null;
  amountRub: number | null;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

export interface PaymentProviderAdapter {
  readonly code: PaymentProviderCode;
  createCheckout(input: ProviderCheckoutInput): Promise<{ checkoutUrl: string; externalOrderId: string | null }>;
  verifyAndParseWebhook(input: ProviderWebhookInput): Promise<NormalizedPaymentEvent>;
  cancelSubscription(input: ProviderSubscriptionInput): Promise<void>;
  getOrderStatus(input: ProviderOrderStatusInput): Promise<NormalizedPaymentEvent | null>;
  listCatalog(input: ProviderCredentials): Promise<ProviderCatalogItem[]>;
  checkConnection(input: ProviderCredentials): Promise<void>;
}
```

The contract carries only normalized values and never exposes stored provider rows to callers.

- [ ] **Step 4: Wrap Prodamus without changing its wire format**

Implement `prodamusAdapter.ts` by delegating URL creation, signature validation, cancel and restore-compatible operations to existing Prodamus helpers. Keep `/payments/prodamus/webhook` active and change its final business action to call the neutral event processor introduced in Task 4.

Until Task 4 exists, add a typed injection point to the route:

```ts
type ProcessPaymentEvent = (event: NormalizedPaymentEvent, providerId: string) => Promise<"processed" | "duplicate">;
```

- [ ] **Step 5: Run all existing payment tests**

Run:

```powershell
pnpm --filter @club/api test -- src/payments/prodamus.test.ts src/payments/prodamusWebhook.test.ts src/payments/providerRegistry.test.ts src/payments/prodamusAdapter.test.ts
pnpm --filter @club/api check
```

Expected: PASS with unchanged Prodamus URLs and webhook decisions.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/payments apps/api/src/routes/payments.ts
git commit -m "refactor: introduce payment provider adapters"
```

---

### Task 3: Implement the Lava API adapter

**Files:**
- Create: `apps/api/src/payments/lava.ts`
- Create: `apps/api/src/payments/lava.test.ts`
- Modify: `apps/api/src/payments/providerRegistry.ts`

**Interfaces:**
- Produces: `lavaAdapter: PaymentProviderAdapter`.
- Consumes: `PaymentProviderAdapter`, `ProviderCheckoutInput`, `ProviderCatalogItem`.
- Uses fixed API origin `https://gate.lava.top`.

- [ ] **Step 1: Write failing Lava client tests with a mocked fetch**

```ts
it("creates an invoice with internal order identity", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    id: "invoice-1",
    paymentUrl: "https://app.lava.top/invoice-1"
  }), { status: 200, headers: { "content-type": "application/json" } }));

  const result = await createLavaCheckout({
    fetch: fetchMock,
    apiKey: "api-key",
    orderId: "club-order-1",
    productId: "product-1",
    offerId: "offer-1",
    amountRub: 990,
    buyerEmail: "buyer@example.com",
    returnUrl: "https://club.example/"
  });

  expect(result.checkoutUrl).toBe("https://app.lava.top/invoice-1");
  expect(fetchMock).toHaveBeenCalledWith(
    "https://gate.lava.top/api/v3/invoice",
    expect.objectContaining({ method: "POST" })
  );
});
```

Also test 401, 429 with `Retry-After`, timeout, malformed JSON, missing checkout URL, catalog normalization and redacted error messages.

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
pnpm --filter @club/api test -- src/payments/lava.test.ts
```

Expected: FAIL because the Lava client does not exist.

- [ ] **Step 3: Implement the Lava client**

Use an injected `fetch`, a 10-second `AbortController`, `X-Api-Key`, JSON content type, and strict Zod response schemas. Create invoices through the documented modern invoice endpoint. Keep API origin constant and reject a response URL unless it uses HTTPS.

Map catalog results to:

```ts
type ProviderCatalogItem = {
  externalProductId: string;
  externalOfferId: string | null;
  title: string;
  kind: "one_time" | "recurrent";
  amountRub: number | null;
  metadata: Record<string, unknown>;
};
```

Thrown errors must contain a stable public code such as `LAVA_UNAUTHORIZED`, `LAVA_RATE_LIMITED`, `LAVA_TIMEOUT`, or `LAVA_INVALID_RESPONSE`; response bodies and credentials are not included.

- [ ] **Step 4: Register the Lava adapter**

```ts
const adapters = new Map<PaymentProviderCode, PaymentProviderAdapter>([
  ["prodamus", prodamusAdapter],
  ["lava", lavaAdapter]
]);
```

- [ ] **Step 5: Update the registry test for Lava and run checks**

Replace the temporary missing-adapter assertion from Task 2 with:

```ts
expect(getPaymentProviderAdapter("lava").code).toBe("lava");
```

Run:

Run:

```powershell
pnpm --filter @club/api test -- src/payments/lava.test.ts src/payments/providerRegistry.test.ts
pnpm --filter @club/api check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/payments/lava.ts apps/api/src/payments/lava.test.ts apps/api/src/payments/providerRegistry.ts
git commit -m "feat: add Lava API adapter"
```

---

### Task 4: Add authenticated Lava webhooks and idempotent event processing

**Files:**
- Create: `apps/api/src/payments/lavaWebhook.ts`
- Create: `apps/api/src/payments/lavaWebhook.test.ts`
- Create: `apps/api/src/payments/paymentEventProcessor.ts`
- Create: `apps/api/src/payments/paymentEventProcessor.test.ts`
- Create: `apps/api/src/routes/lavaPayments.ts`
- Modify: `apps/api/src/routes/payments.ts`
- Modify: `apps/api/src/index.ts`

**Interfaces:**
- Produces: `parseLavaWebhook(request, secret): Promise<NormalizedPaymentEvent>`.
- Produces: `processPaymentEvent(event, providerId): Promise<"processed" | "duplicate" | "ignored">`.
- Consumes the tables created in Task 1.

- [ ] **Step 1: Write failing authentication and normalization tests**

```ts
it("rejects a webhook with a wrong key", async () => {
  await expect(parseLavaWebhook(
    new Request("https://club.example/api/payments/lava/webhook/payment", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "wrong" },
      body: JSON.stringify({ eventType: "payment.success", id: "evt-1" })
    }),
    "correct"
  )).rejects.toMatchObject({ status: 401 });
});

it.each([
  ["payment.success", "payment_succeeded"],
  ["payment.failed", "payment_failed"],
  ["subscription.recurring.payment.success", "renewal_succeeded"],
  ["subscription.recurring.payment.failed", "renewal_failed"],
  ["subscription.cancelled", "subscription_cancelled"]
])("normalizes %s", async (sourceType, expectedType) => {
  const event = await parseLavaWebhook(lavaRequest(sourceType), "correct");
  expect(event.type).toBe(expectedType);
});
```

- [ ] **Step 2: Write failing idempotency and access tests**

Use a transaction-capable repository fake and assert:

```ts
expect(await processPaymentEvent(successEvent, provider.id)).toBe("processed");
expect(await processPaymentEvent(successEvent, provider.id)).toBe("duplicate");
expect(fake.membershipExtensions).toHaveLength(1);
expect(fake.referralAwards).toHaveLength(1);
```

Add cases for failed payment, successful renewal from `max(now, expiresAt)`, failed renewal preserving access, cancellation preserving expiry, unknown order, amount mismatch and events delivered out of order.

- [ ] **Step 3: Run tests and verify failure**

Run:

```powershell
pnpm --filter @club/api test -- src/payments/lavaWebhook.test.ts src/payments/paymentEventProcessor.test.ts
```

Expected: FAIL because parser and processor do not exist.

- [ ] **Step 4: Implement strict webhook parsing**

Accept only POST, `application/json`, and a bounded body. Compare `X-Api-Key` to the stored secret with `timingSafeEqual` after hashing both values to equal-length SHA-256 buffers. Validate the payload with event-specific Zod schemas and derive a stable `eventKey`.

- [ ] **Step 5: Implement transactional event processing**

Inside one database transaction:

1. insert `paymentWebhookEvents` using the unique `(provider, eventKey)` constraint;
2. return `duplicate` on unique conflict;
3. lock or conditionally update the matching order;
4. validate provider, amount and product;
5. update order and neutral recurrent subscription;
6. extend access only for a newly accepted success;
7. award the first-payment referral once;
8. queue the existing payment notification after commit.

Valid irrelevant or duplicate Lava events return HTTP 200. Invalid authentication returns 401, invalid schema returns 400, and transient processing errors return 503 so Lava retries.

- [ ] **Step 6: Add public routes**

Mount:

```ts
app.route("/payments/lava", lavaPaymentsRoute);
```

Expose:

```text
POST /api/payments/lava/webhook/payment
POST /api/payments/lava/webhook/subscription
```

Both routes use the same parser and processor, but only accept their documented event families.

- [ ] **Step 7: Route Prodamus success through the same processor**

Convert the existing verified Prodamus payload to `NormalizedPaymentEvent` and remove duplicated access mutation from `routes/payments.ts`. Existing Prodamus response body and signature behavior remain unchanged.

- [ ] **Step 8: Run payment regression tests**

Run:

```powershell
pnpm --filter @club/api test -- src/payments
pnpm --filter @club/api check
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add apps/api/src/payments apps/api/src/routes/lavaPayments.ts apps/api/src/routes/payments.ts apps/api/src/index.ts
git commit -m "feat: process Lava payment webhooks safely"
```

---

### Task 5: Support provider selection, checkout and subscription actions

**Files:**
- Modify: `apps/api/src/routes/payments.ts`
- Modify: `apps/api/src/payments/recurrentCheckoutGuard.ts`
- Modify: `apps/api/src/membership/profileFields.ts`
- Modify: `apps/api/src/referrals/rules.ts`
- Modify: `apps/api/src/mailings/audience.ts`
- Modify: `apps/api/src/routes/appState.ts`
- Modify: `apps/api/src/routes/me.ts`
- Test: `apps/api/src/payments/paymentCheckout.test.ts`
- Test: existing membership, referral and mailing tests

**Interfaces:**
- Consumes: `getPaymentProviderAdapter`.
- Changes checkout request to `{ productId: string; provider?: PaymentProviderCode }`.
- Produces available `checkoutOptions` for each published tariff.

- [ ] **Step 1: Write failing checkout behavior tests**

Cover these exact scenarios:

```ts
it("uses the only enabled binding without a provider choice");
it("requires a provider when Prodamus and Lava are enabled");
it("rejects a provider not enabled for the selected product");
it("creates a Lava order before requesting its checkout URL");
it("keeps Prodamus checkout output compatible");
it("does not create a second blocking recurrent subscription");
it("marks a failed adapter call without losing the internal order");
```

The two-provider response must be:

```ts
{
  checkoutUrl: null,
  message: "Выберите способ оплаты.",
  options: [
    { provider: "prodamus", title: "Prodamus" },
    { provider: "lava", title: "Lava" }
  ]
}
```

- [ ] **Step 2: Run focused tests and verify failure**

Run:

```powershell
pnpm --filter @club/api test -- src/payments/paymentCheckout.test.ts
```

Expected: FAIL because checkout assumes one Prodamus provider.

- [ ] **Step 3: Generalize checkout**

Load enabled product bindings with their enabled provider. If the request omits `provider`, proceed only when exactly one binding is available. Insert the internal order first, call the chosen adapter, then store returned external identifiers.

Use provider-neutral membership values:

```ts
type SubscriptionPaymentProvider = "prodamus_recurrent" | "lava_recurrent";
```

Keep both values recognized by membership, mailings, referrals, analytics and admin labels.

- [ ] **Step 4: Generalize cancellation and restoration**

Cancellation calls the selected adapter and records `cancelledAt`; it never changes the paid expiry.

For Prodamus, preserve the existing restoration action. The documented Lava API does not expose an equivalent restore operation, so Lava always returns:

```ts
{
  ok: false,
  action: "resubscribe",
  message: "Подписку Lava нужно оформить снова."
}
```

- [ ] **Step 5: Run all affected tests**

Run:

```powershell
pnpm --filter @club/api test -- src/payments src/membership src/referrals src/mailings
pnpm --filter @club/api check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src
git commit -m "feat: support provider-aware checkout and subscriptions"
```

---

### Task 6: Add Lava reconciliation background job

**Files:**
- Create: `apps/api/src/payments/paymentReconciliation.ts`
- Create: `apps/api/src/payments/paymentReconciliation.test.ts`
- Modify: `apps/api/src/backgroundJobs.ts`
- Modify: `apps/api/src/backgroundJobs.test.ts`

**Interfaces:**
- Produces: `reconcileLavaPayments(now?: Date): Promise<ReconciliationSummary>`.
- Produces: `startPaymentReconciliationJob(): ReturnType<typeof setInterval>`.
- Consumes: Lava `getOrderStatus` and `processPaymentEvent`.

- [ ] **Step 1: Write failing reconciliation tests**

```ts
it("reconciles recent pending Lava orders with bounded concurrency", async () => {
  const summary = await reconcileLavaPayments(new Date("2026-07-25T12:00:00Z"));
  expect(summary).toEqual({ checked: 3, corrected: 1, failed: 0 });
  expect(fakeApi.maxConcurrentRequests).toBeLessThanOrEqual(4);
});

it("continues after a transient order failure");
it("does not query completed old orders");
it("feeds a recovered success through the idempotent event processor");
it("redacts provider responses in logs");
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
pnpm --filter @club/api test -- src/payments/paymentReconciliation.test.ts src/backgroundJobs.test.ts
```

Expected: FAIL because the job does not exist.

- [ ] **Step 3: Implement reconciliation**

Every five minutes, select:

- pending Lava orders created within the last seven days;
- Lava subscriptions that are active, cancelled recently, or awaiting a renewal result.

Process at most four requests concurrently. Honor `Retry-After`, use capped exponential backoff for 429/5xx, and transform confirmed status changes into normalized events. Do not mutate access directly in the job.

- [ ] **Step 4: Register lifecycle**

Load the job lazily in `startBackgroundJobs()`, start it with the existing jobs, and clear its timer in the returned shutdown function.

- [ ] **Step 5: Run tests**

Run:

```powershell
pnpm --filter @club/api test -- src/payments/paymentReconciliation.test.ts src/backgroundJobs.test.ts
pnpm --filter @club/api check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/payments/paymentReconciliation.ts apps/api/src/payments/paymentReconciliation.test.ts apps/api/src/backgroundJobs.ts apps/api/src/backgroundJobs.test.ts
git commit -m "feat: reconcile Lava payment states"
```

---

### Task 7: Add provider administration, connection check and catalog sync

**Files:**
- Modify: `apps/api/src/routes/payments.ts`
- Create: `apps/api/src/payments/providerAdminService.ts`
- Create: `apps/api/src/payments/providerAdminService.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/web/src/api/client.ts`

**Interfaces:**
- Produces admin endpoints for provider list, Lava save/check, catalog sync and tariff bindings.
- Consumes: adapter `checkConnection` and `listCatalog`.

- [ ] **Step 1: Write failing admin-service tests**

Test that:

```ts
it("returns both providers without secrets");
it("keeps an existing API key when the save payload omits it");
it("records a verified connection state");
it("records a safe connection error");
it("upserts catalog items and marks missing remote items stale");
it("rejects a published product with no valid enabled binding");
it("preserves the migrated Prodamus binding when editing a tariff");
```

Assert:

```ts
expect(JSON.stringify(response)).not.toContain("lava-api-key");
expect(JSON.stringify(response)).not.toContain("webhook-secret");
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
pnpm --filter @club/api test -- src/payments/providerAdminService.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the service and routes**

Add:

```text
GET  /api/payments/admin/providers
POST /api/payments/admin/providers/lava
POST /api/payments/admin/providers/lava/check
POST /api/payments/admin/providers/lava/catalog/sync
GET  /api/payments/admin/providers/lava/catalog
```

Extend product create/update payload with:

```ts
bindings: z.array(z.object({
  provider: paymentProviderCodeSchema,
  enabled: z.boolean(),
  externalProductId: z.string().trim().min(1).max(160).nullable(),
  externalOfferId: z.string().trim().min(1).max(160).nullable()
})).max(2)
```

Create the webhook secret server-side with at least 32 random bytes when Lava is first configured. Return the two complete webhook URLs, never the secret.

- [ ] **Step 4: Add typed web client functions**

```ts
export function saveLavaProvider(payload: { apiKey?: string; isEnabled?: boolean });
export function checkLavaProvider();
export function syncLavaCatalog();
export function getLavaCatalog();
export function createPaymentCheckout(productId: string, provider?: PaymentProviderCode);
```

- [ ] **Step 5: Run API and shared checks**

Run:

```powershell
pnpm --filter @club/api test -- src/payments/providerAdminService.test.ts
pnpm --filter @club/shared check
pnpm --filter @club/api check
pnpm --filter @club/web check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/routes/payments.ts apps/api/src/payments/providerAdminService.ts apps/api/src/payments/providerAdminService.test.ts packages/shared/src/index.ts apps/web/src/api/client.ts
git commit -m "feat: add Lava payment administration"
```

---

### Task 8: Build the mobile provider and tariff UI

**Files:**
- Create: `apps/web/src/features/billing/PaymentProviderChooser.vue`
- Create: `apps/web/src/features/billing/PaymentProviderChooser.test.ts`
- Create: `apps/web/src/features/billing/PaymentProviderSettings.vue`
- Create: `apps/web/src/features/billing/PaymentProviderSettings.test.ts`
- Create: `apps/web/src/features/billing/PaymentProductBindings.vue`
- Create: `apps/web/src/features/billing/PaymentProductBindings.test.ts`
- Modify: `apps/web/src/features/billing/PaymentsSection.vue`
- Modify: `apps/web/src/features/billing/paymentMessages.ts`
- Test: `apps/web/src/features/app/responsiveLayoutAudit.test.ts`

**Interfaces:**
- Consumes `PaymentProvider`, `PaymentCheckoutOption`, `PaymentProductProviderBinding`.
- Emits `select(provider)`, `save(settings)`, `check`, `sync`, and `update:bindings`.

- [ ] **Step 1: Write failing component tests**

For the chooser:

```ts
it("renders two provider buttons and emits the selected code");
it("uses a single column below 360px and respects safe-area insets");
it("closes without creating an order");
```

For settings:

```ts
it("shows configured state without rendering the stored secret");
it("shows both Lava webhook URLs");
it("disables sync until Lava is configured");
it("shows a safe connection error without overflowing");
```

For bindings:

```ts
it("allows Prodamus and Lava simultaneously");
it("uses synced Lava catalog or manual IDs");
it("prevents publishing when an enabled binding is incomplete");
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```powershell
pnpm --filter @club/web test -- src/features/billing/PaymentProviderChooser.test.ts src/features/billing/PaymentProviderSettings.test.ts src/features/billing/PaymentProductBindings.test.ts
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement provider settings cards**

Use the existing visual language: full-width mobile cards, 44px minimum touch targets, `min-width: 0`, `overflow-wrap: anywhere` only for webhook URLs, and no nested horizontal scrolling. Show status labels:

```text
Не подключено
Подключено
Соединение проверено
Ошибка подключения
```

Put connection check and catalog synchronization inside the Lava card. Keep Prodamus fields and behavior unchanged.

- [ ] **Step 4: Implement tariff bindings**

Each provider row has an enable switch and its own fields. Lava first shows the synchronized selector and then the manual-ID fallback. Validation is inline and identifies the exact provider.

- [ ] **Step 5: Implement checkout choice**

When checkout returns two options, open `PaymentProviderChooser`. After selection, repeat checkout with the provider code and pass the returned URL to existing `openPaymentCheckoutUrl`. A one-provider tariff keeps the current direct flow.

- [ ] **Step 6: Run web tests and responsive audit**

Run:

```powershell
pnpm --filter @club/web test -- src/features/billing src/features/app/responsiveLayoutAudit.test.ts
pnpm --filter @club/web check
pnpm --filter @club/web build
```

Expected: PASS. No fixed-width control exceeds a 320px viewport, and bottom-sheet actions remain above iOS and Android safe areas.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/features/billing apps/web/src/api/client.ts
git commit -m "feat: add Lava payment settings and checkout choice"
```

---

### Task 9: Full regression, release and production verification

**Files:**
- Modify: `apps/web/src/features/app/version.ts`
- Modify: `apps/web/src/features/app/releaseNotes.ts`
- Modify: `apps/web/src/features/app/releaseNotes.test.ts`
- Modify: `.github/workflows/deploy.yml` only if a new verification step is required
- Test: `apps/api/src/payments/*`
- Test: `apps/web/src/features/billing/*`
- Test: Playwright device and release suites

**Interfaces:**
- Consumes all previous tasks.
- Produces a deployable release with Prodamus regression evidence and Lava configuration-ready production endpoints.

- [ ] **Step 1: Run migration in an isolated test database**

Run the project migration command against a disposable database copy:

```powershell
pnpm db:migrate
```

Expected: migration 0054 succeeds, existing Prodamus products receive one enabled binding, and no existing payment row is deleted.

- [ ] **Step 2: Run the full local verification**

```powershell
pnpm check
pnpm test
pnpm build
pnpm test:e2e:devices
```

Expected: all commands exit successfully.

- [ ] **Step 3: Verify security properties**

Run focused searches and tests:

```powershell
rg -n "apiKey|webhookSecret|secretKey" apps/api/src/routes apps/api/src/payments
pnpm --filter @club/api test -- src/payments
```

Inspect every route response and logger call found by the search. Raw key values must only be passed to an adapter or constant-time verifier.

- [ ] **Step 4: Bump the application version and record release notes**

Set `appVersion` to `5.52`, set `appVersionUpdatedAt` to the actual Novosibirsk deployment time, update the version assertion, and add the first release-note entry with:

```text
- Добавлена Lava как второй способ оплаты.
- Тариф может принимать Prodamus, Lava или оба способа.
- Добавлена безопасная обработка разовых и рекуррентных событий Lava.
- Добавлена автоматическая сверка зависших платежей.
```

- [ ] **Step 5: Commit the release**

```powershell
git add .
git commit -m "chore: release Lava payment integration"
```

- [ ] **Step 6: Deploy using the existing production workflow**

Push `main`; `.github/workflows/deploy.yml` runs checks, tests, builds, release browser tests and then `deploy/update.sh`. Do not run a manual destructive database operation.

- [ ] **Step 7: Verify production without real credentials**

Confirm:

```text
GET /health -> 200
Existing Prodamus tariff list loads
Existing Prodamus checkout link is created
Lava card displays “Не подключено”
Both Lava webhook endpoints reject a missing X-Api-Key
No new application or migration errors appear in server logs
Android and iPhone payment screens do not overflow
```

- [ ] **Step 8: Complete live Lava verification after owner configuration**

The owner enters the Lava API key in the admin form and registers both displayed webhook URLs in Lava. Then:

1. run «Проверить соединение»;
2. synchronize the catalog;
3. bind one low-price test tariff;
4. complete one real or officially supported test payment;
5. verify one order, one webhook event and one access extension;
6. cancel the test subscription if it is recurrent.

No API key is sent through chat or stored in test fixtures.

---

## Plan Self-Review

- Every design requirement maps to a task: neutral architecture (Tasks 1–2), Lava API (Task 3), webhook safety and access (Task 4), checkout and subscriptions (Task 5), reconciliation (Task 6), administration and catalog (Task 7), mobile UI (Task 8), migration/release/production verification (Task 9).
- The first release is additive and contains no destructive schema step.
- Shared type names and adapter signatures are consistent across tasks.
- Prodamus compatibility is explicitly tested before and after the refactor.
- Live payment verification is separated from implementation because production credentials must be entered by the owner in the application.
