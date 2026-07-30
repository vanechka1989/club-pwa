import type { AdminIndividualPaymentOfferPayload, PaymentCurrency, PaymentProductKind, PaymentProviderCode } from "@club/shared";
import { isLavaCatalogPriceForProduct } from "./lavaPeriodicity";

type OfferProvider = {
  id: string;
  provider: string;
  isEnabled: boolean;
  secretKey: string | null;
  apiKey: string | null;
  webhookSecret: string | null;
};

type OfferCatalogItem = {
  id: string;
  externalProductId: string;
  externalOfferId: string | null;
  title: string;
  kind: PaymentProductKind;
  amountRub: number | null;
  metadata: Record<string, unknown> | null;
  isStale: boolean;
  isSelectable: boolean;
  prices: Array<{ currency: PaymentCurrency; amountMinor: number | null; periodicity: string | null }>;
};

export type IndividualOfferDraft = {
  providerId: string;
  provider: PaymentProviderCode;
  kind: PaymentProductKind;
  title: string;
  currency: PaymentCurrency;
  amountMinor: number;
  accessDays: number;
  externalProductId: string | null;
  externalOfferId: string | null;
  catalogSnapshot: Record<string, unknown> | null;
};

function requireProvider(code: PaymentProviderCode, providers: OfferProvider[]) {
  const provider = providers.find((entry) => entry.provider === code && entry.isEnabled);
  if (!provider) throw new Error("INDIVIDUAL_OFFER_PROVIDER_UNAVAILABLE");
  if (code === "prodamus" && !provider.secretKey) throw new Error("INDIVIDUAL_OFFER_PROVIDER_UNAVAILABLE");
  if (code === "lava" && (!provider.apiKey || !provider.webhookSecret)) throw new Error("INDIVIDUAL_OFFER_PROVIDER_UNAVAILABLE");
  return provider;
}

export function buildIndividualOfferDraft(
  payload: AdminIndividualPaymentOfferPayload,
  context: { providers: OfferProvider[]; lavaCatalog: OfferCatalogItem[] }
): IndividualOfferDraft {
  const provider = requireProvider(payload.provider, context.providers);
  if (payload.provider === "prodamus") {
    return {
      providerId: provider.id,
      provider: "prodamus",
      kind: payload.kind,
      title: payload.title.trim(),
      currency: "RUB",
      amountMinor: payload.amountRub * 100,
      accessDays: payload.accessDays,
      externalProductId: payload.kind === "recurrent" ? payload.externalProductId : null,
      externalOfferId: null,
      catalogSnapshot: null
    };
  }

  const item = context.lavaCatalog.find((entry) => entry.id === payload.catalogItemId);
  if (!item || item.isStale || !item.isSelectable || !item.externalOfferId) {
    throw new Error("INDIVIDUAL_OFFER_CATALOG_UNAVAILABLE");
  }
  const price = item.prices.find((entry) =>
    entry.currency === payload.currency && isLavaCatalogPriceForProduct(entry.periodicity, item.kind, payload.accessDays)
  );
  if (!price) throw new Error("INDIVIDUAL_OFFER_CATALOG_PRICE_UNAVAILABLE");
  if (price.amountMinor !== null && payload.customAmountMinor !== undefined) {
    throw new Error("INDIVIDUAL_OFFER_FIXED_PRICE");
  }
  const amountMinor = price.amountMinor ?? payload.customAmountMinor;
  if (!amountMinor) throw new Error("INDIVIDUAL_OFFER_CUSTOM_PRICE_REQUIRED");
  return {
    providerId: provider.id,
    provider: "lava",
    kind: item.kind,
    title: item.title,
    currency: payload.currency,
    amountMinor,
    accessDays: payload.accessDays,
    externalProductId: item.externalProductId,
    externalOfferId: item.externalOfferId,
    catalogSnapshot: {
      catalogItemId: item.id,
      externalProductId: item.externalProductId,
      externalOfferId: item.externalOfferId,
      title: item.title,
      kind: item.kind,
      currency: payload.currency,
      amountMinor,
      accessDays: payload.accessDays,
      metadata: item.metadata
    }
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]!);
}

export function buildIndividualOfferNotification(input: {
  title: string;
  currency: PaymentCurrency;
  amountMinor: number;
  accessDays: number;
  expiresAt: Date;
  appPath: string;
}) {
  if (!/^\/payments\/offers\/[A-Za-z0-9_-]+$/.test(input.appPath)) {
    throw new Error("INDIVIDUAL_OFFER_APP_PATH_INVALID");
  }
  const amount = new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: input.currency,
    maximumFractionDigits: 2
  }).format(input.amountMinor / 100);
  const title = escapeHtml(input.title);
  const safePath = escapeHtml(input.appPath);
  const deadline = input.expiresAt.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  const body = `${input.title} — ${amount}, доступ на ${input.accessDays} дн. Предложение действует до ${deadline}.`;
  return {
    title: "Персональное предложение",
    body,
    bodyHtml: `<strong>${title}</strong><br>${escapeHtml(amount)} · ${input.accessDays} дн.<br>Действует до ${escapeHtml(deadline)}.<br><a href="${safePath}">Перейти к оплате</a>`,
    pushUrl: input.appPath
  };
}
