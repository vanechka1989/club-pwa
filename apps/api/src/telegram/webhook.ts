export const telegramWebhookAllowedUpdates = ["message", "my_chat_member"] as const;

type TelegramFetch = (url: string, init: RequestInit) => Promise<Response>;

type SetTelegramWebhookOptions = {
  token: string;
  webOrigin: string;
  secretToken?: string | undefined;
  fetchImpl?: TelegramFetch;
};

export function buildTelegramWebhookPayload({
  webOrigin,
  secretToken
}: {
  webOrigin: string;
  secretToken?: string | undefined;
}) {
  return {
    url: `${webOrigin.replace(/\/$/, "")}/api/telegram/webhook`,
    ...(secretToken ? { secret_token: secretToken } : {}),
    allowed_updates: [...telegramWebhookAllowedUpdates]
  };
}

export async function setTelegramWebhook({
  token,
  webOrigin,
  secretToken,
  fetchImpl = fetch
}: SetTelegramWebhookOptions) {
  const payloadOptions: { webOrigin: string; secretToken?: string } = { webOrigin };
  if (secretToken) {
    payloadOptions.secretToken = secretToken;
  }

  const response = await fetchImpl(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(buildTelegramWebhookPayload(payloadOptions))
  });

  if (!response.ok) {
    throw new Error(`Telegram setWebhook failed: ${response.status}`);
  }

  const body = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || !("ok" in body) || body.ok !== true) {
    throw new Error("Telegram setWebhook returned an unsuccessful response");
  }

  return body;
}
