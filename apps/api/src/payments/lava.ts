import { z } from "zod";
import type {
  PaymentProviderAdapter,
  PaymentProviderCredentials,
  ProviderCatalogItem,
  ProviderCheckoutInput
} from "./providerAdapter";

const lavaApiOrigin = "https://gate.lava.top";
const requestTimeoutMs = 10_000;

const invoiceResponseSchema = z.object({
  id: z.string().uuid(),
  paymentUrl: z.string()
});

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

const catalogResponseSchema = z.object({
  items: z.array(z.object({
    type: z.string(),
    data: z.object({
      id: z.string(),
      title: z.string().nullable().optional(),
      type: z.string().optional(),
      offers: z.array(offerSchema).nullable().optional()
    }).passthrough()
  }).passthrough()).default([])
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
              currency: "RUB",
              amount: input.product.amountRub,
              buyerLanguage: "RU"
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
      catalogResponseSchema.parse(await request("/api/v2/products?showAllSubscriptionPeriods=true"));
    },

    async listCatalog(credentials = {}) {
      const apiKey = configuredApiKey(credentials, options.apiKey);
      if (apiKey !== options.apiKey) {
        return createLavaClient({ apiKey, fetch: fetchImpl }).listCatalog(credentials);
      }
      const response = catalogResponseSchema.safeParse(await request("/api/v2/products?showAllSubscriptionPeriods=true"));
      if (!response.success) throw new LavaApiError("LAVA_INVALID_RESPONSE");

      const result: ProviderCatalogItem[] = [];
      for (const item of response.data.items) {
        if (!item.type.toUpperCase().includes("PRODUCT")) continue;
        for (const offer of item.data.offers ?? []) {
          const rubPrice = offer.prices.find((price) => price.currency === "RUB");
          const periodicity = rubPrice?.periodicity ?? offer.prices[0]?.periodicity ?? offer.recurrent;
          result.push({
            externalProductId: item.data.id,
            externalOfferId: offer.id,
            title: offer.name || item.data.title || "Товар Lava",
            kind: periodicity && periodicity !== "ONE_TIME" ? "recurrent" : "one_time",
            amountRub: rubPrice?.amount ?? null,
            metadata: {
              productType: item.data.type ?? null,
              periodicity: periodicity ?? null
            }
          });
        }
      }
      return result;
    },

    async cancelSubscription(input) {
      const apiKey = configuredApiKey(input.credentials, options.apiKey);
      const client = apiKey === options.apiKey ? request : async (path: string, init?: RequestInit) => {
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
