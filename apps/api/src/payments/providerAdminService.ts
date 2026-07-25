import type { PaymentProvider } from "../db/schema";

export function lavaWebhookUrls(origin: string) {
  const base = origin.replace(/\/$/, "");
  return {
    payment: `${base}/api/payments/lava/webhook/payment`,
    subscription: `${base}/api/payments/lava/webhook/subscription`
  };
}

export function mapPaymentProviderForAdmin(provider: PaymentProvider, origin: string) {
  const configured = provider.provider === "lava" ? Boolean(provider.apiKey) : Boolean(provider.formUrl && provider.secretKey);
  const connectionState = !configured
    ? "not_configured" as const
    : provider.lastCheckError
      ? "error" as const
      : provider.lastCheckedAt
        ? "verified" as const
        : "configured" as const;

  return {
    id: provider.id,
    provider: provider.provider === "lava" ? "lava" as const : "prodamus" as const,
    title: provider.title,
    formUrl: provider.formUrl,
    sys: provider.sys,
    isEnabled: provider.isEnabled,
    secretConfigured: provider.provider === "lava" ? Boolean(provider.apiKey) : Boolean(provider.secretKey),
    webhookSecretConfigured: Boolean(provider.webhookSecret),
    connectionState,
    lastCheckedAt: provider.lastCheckedAt?.toISOString() ?? null,
    lastCheckError: provider.lastCheckError ? "Не удалось проверить подключение." : null,
    webhookUrl: provider.provider === "prodamus"
      ? `${origin.replace(/\/$/, "")}/api/payments/prodamus/webhook`
      : undefined,
    webhookUrls: provider.provider === "lava" ? lavaWebhookUrls(origin) : undefined
  };
}
