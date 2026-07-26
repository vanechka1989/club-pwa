import { z } from "zod";
import { paymentCurrencySchema } from "@club/shared";
import type {
  NormalizedPaymentEvent,
  PaymentProviderAdapter,
  PaymentProviderCredentials,
  ProviderCatalogItem,
  ProviderCheckoutInput
} from "./providerAdapter";
import { majorToMinor, minorToMajor, PaymentMoneyError } from "./money";

const lavaApiOrigin = "https://gate.lava.top";
const requestTimeoutMs = 10_000;

const invoiceResponseSchema = z.object({
  id: z.string().uuid(),
  paymentUrl: z.string()
});

const invoiceStatusResponseSchema = z.object({
  id: z.string(),
  type: z.enum(["INVOICE", "SUBSCRIPTION_FIRST_INVOICE", "SUBSCRIPTION_RENEWAL"]),
  datetime: z.string(),
  status: z.enum(["NEW", "IN_PROGRESS", "COMPLETED", "FAILED"]),
  receipt: z.object({
    amount: z.number(),
    currency: z.string()
  }),
  buyer: z.object({ email: z.string().email() }),
  parentInvoice: z.object({ id: z.string() }).nullable().optional(),
  subscriptionStatus: z.enum(["ACTIVE", "CANCELLED", "FAILED"]).nullable().optional()
}).passthrough();

const subscriptionStatusResponseSchema = z.object({
  id: z.string(),
  datetime: z.string(),
  receipt: z.object({ amount: z.number(), currency: z.string() }),
  buyer: z.object({ email: z.string().email() }),
  subscriptionStatus: z.enum(["ACTIVE", "CANCELLED", "FAILED"]),
  cancelledAt: z.string().nullable().optional(),
  recurrentPayments: z.array(z.object({
    id: z.string(),
    datetime: z.string(),
    status: z.enum(["NEW", "IN_PROGRESS", "COMPLETED", "FAILED"]),
    amount: z.number(),
    currency: z.string()
  })).default([])
}).passthrough();

const priceSchema = z.object({
  amount: z.number().nullable().optional(),
  currency: z.string(),
  periodicity: z.string().optional()
}).passthrough();

const offerSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  prices: z.array(priceSchema).default([]),
  recurrent: z.string().nullable().optional()
}).passthrough();

const catalogProductSchema = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  type: z.string().optional(),
  offers: z.array(offerSchema).nullable().optional()
}).passthrough();

const legacyCatalogItemSchema = z.object({
  type: z.string(),
  data: catalogProductSchema
}).passthrough();

const catalogItemSchema = z.union([legacyCatalogItemSchema, catalogProductSchema]);

const catalogResponseSchema = z.object({
  items: z.array(catalogItemSchema).default([])
}).passthrough();

export type LavaApiErrorCode =
  | "LAVA_UNAUTHORIZED"
  | "LAVA_RATE_LIMITED"
  | "LAVA_TIMEOUT"
  | "LAVA_INVALID_RESPONSE"
  | "LAVA_UNAVAILABLE";

export class LavaApiError extends Error {
  constructor(readonly code: LavaApiErrorCode) {
    super(code);
    this.name = "LavaApiError";
  }
}

type LavaClientOptions = {
  apiKey: string;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
};

function configuredApiKey(credentials: PaymentProviderCredentials, fallback: string) {
  const value = credentials.apiKey || fallback;
  if (!value) throw new LavaApiError("LAVA_UNAUTHORIZED");
  return value;
}

function errorForStatus(status: number) {
  if (status === 401 || status === 403) return new LavaApiError("LAVA_UNAUTHORIZED");
  if (status === 429) return new LavaApiError("LAVA_RATE_LIMITED");
  return new LavaApiError("LAVA_UNAVAILABLE");
}

function lavaPeriodicity(kind: ProviderCheckoutInput["product"]["kind"], accessDays: number) {
  if (kind === "one_time") return undefined;
  const values = new Map<number, string>([
    [30, "MONTHLY"],
    [90, "PERIOD_90_DAYS"],
    [180, "PERIOD_180_DAYS"],
    [365, "PERIOD_YEAR"]
  ]);
  const value = values.get(accessDays);
  if (!value) throw new LavaApiError("LAVA_INVALID_RESPONSE");
  return value;
}

function parseCatalogResponse(payload: unknown) {
  const response = catalogResponseSchema.safeParse(payload);
  if (!response.success) throw new LavaApiError("LAVA_INVALID_RESPONSE");
  return response.data;
}

function normalizeCatalogItem(item: z.infer<typeof catalogItemSchema>) {
  const legacyItem = legacyCatalogItemSchema.safeParse(item);
  return legacyItem.success
    ? { ...legacyItem.data.data, feedType: legacyItem.data.type }
    : { ...catalogProductSchema.parse(item), feedType: "PRODUCT" };
}

function normalizeMoney(amount: number, currency: string) {
  const parsedCurrency = paymentCurrencySchema.safeParse(currency.toUpperCase());
  if (!parsedCurrency.success) throw new LavaApiError("LAVA_INVALID_RESPONSE");
  try {
    return { currency: parsedCurrency.data, amountMinor: majorToMinor(amount) };
  } catch (error) {
    if (error instanceof PaymentMoneyError) throw new LavaApiError("LAVA_INVALID_RESPONSE");
    throw error;
  }
}

export function createLavaClient(options: LavaClientOptions): PaymentProviderAdapter {
  const fetchImpl = options.fetch ?? fetch;

  async function request(path: string, init: RequestInit = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetchImpl(`${lavaApiOrigin}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Api-Key": options.apiKey,
          ...init.headers
        },
        signal: controller.signal
      });
      if (!response.ok) throw errorForStatus(response.status);
      return await response.json().catch(() => {
        throw new LavaApiError("LAVA_INVALID_RESPONSE");
      });
    } catch (error) {
      if (error instanceof LavaApiError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new LavaApiError("LAVA_TIMEOUT");
      throw new LavaApiError("LAVA_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    code: "lava",

    async createCheckout(input: ProviderCheckoutInput) {
      const apiKey = configuredApiKey(input.credentials, options.apiKey);
      if (!input.user.email || !input.product.externalOfferId) {
        throw new LavaApiError("LAVA_INVALID_RESPONSE");
      }

      const payload = await (apiKey === options.apiKey
        ? request("/api/v3/invoice", {
            method: "POST",
            body: JSON.stringify({
              email: input.user.email,
              offerId: input.product.externalOfferId,
              currency: input.product.currency ?? "RUB",
              ...(input.product.useCustomAmount
                ? { amount: minorToMajor(input.product.amountMinor ?? majorToMinor(input.product.amountRub)) }
                : {}),
              buyerLanguage: "RU",
              ...(lavaPeriodicity(input.product.kind, input.product.accessDays)
                ? { periodicity: lavaPeriodicity(input.product.kind, input.product.accessDays) }
                : {})
            })
          })
        : createLavaClient({ apiKey, fetch: fetchImpl }).createCheckout(input));

      if ("checkoutUrl" in (payload as object)) {
        return payload as { checkoutUrl: string; externalOrderId: string | null };
      }

      const parsed = invoiceResponseSchema.safeParse(payload);
      if (!parsed.success) throw new LavaApiError("LAVA_INVALID_RESPONSE");
      const checkoutUrl = new URL(parsed.data.paymentUrl);
      if (checkoutUrl.protocol !== "https:") throw new LavaApiError("LAVA_INVALID_RESPONSE");
      return { checkoutUrl: checkoutUrl.toString(), externalOrderId: parsed.data.id };
    },

    async checkConnection(credentials = {}) {
      const apiKey = configuredApiKey(credentials, options.apiKey);
      if (apiKey !== options.apiKey) {
        await createLavaClient({ apiKey, fetch: fetchImpl }).checkConnection(credentials);
        return;
      }
      parseCatalogResponse(await request("/api/v2/products?showAllSubscriptionPeriods=true"));
    },

    async listCatalog(credentials = {}) {
      const apiKey = configuredApiKey(credentials, options.apiKey);
      if (apiKey !== options.apiKey) {
        return createLavaClient({ apiKey, fetch: fetchImpl }).listCatalog(credentials);
      }
      const response = parseCatalogResponse(await request("/api/v2/products?showAllSubscriptionPeriods=true"));

      const result: ProviderCatalogItem[] = [];
      for (const rawItem of response.items) {
        const item = normalizeCatalogItem(rawItem);
        if (!item.feedType.toUpperCase().includes("PRODUCT")) continue;
        for (const offer of item.offers ?? []) {
          const prices: ProviderCatalogItem["prices"] = [];
          for (const price of offer.prices) {
            const currency = paymentCurrencySchema.safeParse(price.currency.toUpperCase());
            if (!currency.success) continue;
            if (price.amount === null || price.amount === undefined) {
              prices.push({ currency: currency.data, amountMinor: null, periodicity: price.periodicity ?? null });
              continue;
            }
            try {
              prices.push({ currency: currency.data, amountMinor: majorToMinor(price.amount), periodicity: price.periodicity ?? null });
            } catch (error) {
              if (error instanceof PaymentMoneyError) throw new LavaApiError("LAVA_INVALID_RESPONSE");
              throw error;
            }
          }
          const rubPrice = prices.find((price) => price.currency === "RUB");
          const periodicity = rubPrice?.periodicity ?? offer.prices[0]?.periodicity ?? offer.recurrent;
          result.push({
            externalProductId: item.id,
            externalOfferId: offer.id,
            title: offer.name || item.title || "Товар Lava",
            kind: periodicity && periodicity !== "ONE_TIME" ? "recurrent" : "one_time",
            amountRub: rubPrice?.amountMinor === null || rubPrice?.amountMinor === undefined
              ? null
              : minorToMajor(rubPrice.amountMinor),
            prices,
            metadata: {
              productType: item.type ?? null,
              periodicity: periodicity ?? null
            }
          });
        }
      }
      return result;
    },

    async getOrderStatus(input) {
      const apiKey = configuredApiKey(input.credentials, options.apiKey);
      if (apiKey !== options.apiKey) {
        return createLavaClient({ apiKey, fetch: fetchImpl }).getOrderStatus?.(input) ?? null;
      }
      const response = invoiceStatusResponseSchema.safeParse(
        await request(`/api/v2/invoices/${encodeURIComponent(input.externalOrderId)}`)
      );
      if (!response.success) throw new LavaApiError("LAVA_INVALID_RESPONSE");
      if (response.data.status === "NEW" || response.data.status === "IN_PROGRESS") return null;

      const isRenewal = response.data.type === "SUBSCRIPTION_RENEWAL";
      const succeeded = response.data.status === "COMPLETED";
      const externalSubscriptionId = response.data.type === "INVOICE"
        ? null
        : isRenewal
          ? response.data.parentInvoice?.id ?? null
          : response.data.id;
      return {
        eventKey: `reconcile:${response.data.id}:${response.data.status}`,
        provider: "lava",
        type: isRenewal
          ? succeeded ? "renewal_succeeded" : "renewal_failed"
          : succeeded ? "payment_succeeded" : "payment_failed",
        externalOrderId: isRenewal
          ? response.data.parentInvoice?.id ?? response.data.id
          : response.data.id,
        externalPaymentId: response.data.id,
        externalSubscriptionId,
        productId: input.productId,
        buyerEmail: response.data.buyer.email || input.buyerEmail,
        amountRub: response.data.receipt.amount,
        ...normalizeMoney(response.data.receipt.amount, response.data.receipt.currency),
        occurredAt: new Date(response.data.datetime),
        payload: {
          source: "reconciliation",
          invoiceId: response.data.id,
          status: response.data.status,
          subscriptionStatus: response.data.subscriptionStatus ?? null
        }
      };
    },

    async getSubscriptionEvents(input) {
      const apiKey = configuredApiKey(input.credentials, options.apiKey);
      if (apiKey !== options.apiKey) {
        return await createLavaClient({ apiKey, fetch: fetchImpl }).getSubscriptionEvents?.(input) ?? [];
      }
      const response = subscriptionStatusResponseSchema.safeParse(
        await request(`/api/v1/subscriptions/${encodeURIComponent(input.externalSubscriptionId)}`)
      );
      if (!response.success) throw new LavaApiError("LAVA_INVALID_RESPONSE");
      const events: NormalizedPaymentEvent[] = response.data.recurrentPayments
        .filter((payment) => payment.status === "COMPLETED" || payment.status === "FAILED")
        .map((payment) => ({
          eventKey: `reconcile:subscription:${payment.id}:${payment.status}`,
          provider: "lava" as const,
          type: payment.status === "COMPLETED" ? "renewal_succeeded" as const : "renewal_failed" as const,
          externalOrderId: response.data.id,
          externalPaymentId: payment.id,
          externalSubscriptionId: response.data.id,
          productId: input.productId,
          buyerEmail: response.data.buyer.email,
          amountRub: payment.amount,
          ...normalizeMoney(payment.amount, payment.currency),
          occurredAt: new Date(payment.datetime),
          payload: { source: "subscription_reconciliation", status: payment.status, paymentId: payment.id }
        }));
      if (response.data.subscriptionStatus === "CANCELLED") {
        events.push({
          eventKey: `reconcile:subscription:${response.data.id}:CANCELLED`,
          provider: "lava",
          type: "subscription_cancelled",
          externalOrderId: response.data.id,
          externalPaymentId: response.data.id,
          externalSubscriptionId: response.data.id,
          productId: input.productId,
          buyerEmail: response.data.buyer.email,
          amountRub: response.data.receipt.amount,
          ...normalizeMoney(response.data.receipt.amount, response.data.receipt.currency),
          occurredAt: new Date(response.data.cancelledAt ?? response.data.datetime),
          payload: { source: "subscription_reconciliation", status: "CANCELLED" }
        });
      }
      return events;
    },

    async cancelSubscription(input) {
      const apiKey = configuredApiKey(input.credentials, options.apiKey);
      const client = apiKey === options.apiKey ? request : async (_path: string, _init?: RequestInit) => {
        const nested = createLavaClient({ apiKey, fetch: fetchImpl });
        if (!nested.cancelSubscription) throw new LavaApiError("LAVA_UNAVAILABLE");
        await nested.cancelSubscription(input);
        return {};
      };
      await client(
        `/api/v1/subscriptions?contractId=${encodeURIComponent(input.externalSubscriptionId)}&email=${encodeURIComponent(input.customerEmail)}`,
        { method: "DELETE" }
      );
    }
  };
}

export const lavaAdapter = createLavaClient({ apiKey: "" });
