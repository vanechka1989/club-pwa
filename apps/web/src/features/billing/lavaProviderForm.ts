type ExistingLavaProvider = { isEnabled: boolean; testBuyerEmail?: string | null } | null;

export function buildLavaProviderForm(
  provider: ExistingLavaProvider,
  currentWebhookSecret: string,
  generateWebhookSecret: () => string
) {
  return {
    apiKey: "",
    webhookSecret: provider ? "" : currentWebhookSecret.trim() || generateWebhookSecret(),
    testBuyerEmail: provider?.testBuyerEmail ?? "",
    isEnabled: provider?.isEnabled ?? true
  };
}
