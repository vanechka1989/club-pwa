type ExistingLavaProvider = { isEnabled: boolean } | null;

export function buildLavaProviderForm(
  provider: ExistingLavaProvider,
  currentWebhookSecret: string,
  generateWebhookSecret: () => string
) {
  return {
    apiKey: "",
    webhookSecret: provider ? "" : currentWebhookSecret.trim() || generateWebhookSecret(),
    isEnabled: provider?.isEnabled ?? true
  };
}
