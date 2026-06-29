export type MailingChannel = "bot" | "app" | "all";

const telegramMessagesPerSecond = 20;
const appNotificationsPerSecond = 300;

export function estimateMailingDurationSeconds({
  recipientCount,
  channel
}: {
  recipientCount: number;
  channel: MailingChannel;
}) {
  const normalizedCount = Math.max(0, Math.floor(recipientCount));
  if (normalizedCount === 0) {
    return 0;
  }

  if (channel === "app") {
    return Math.max(1, Math.ceil(normalizedCount / appNotificationsPerSecond));
  }

  return Math.max(1, Math.ceil((normalizedCount / telegramMessagesPerSecond) * 1.1));
}

export function formatMailingDuration(seconds: number) {
  const normalizedSeconds = Math.max(0, Math.floor(seconds));
  if (normalizedSeconds === 0) {
    return "~0 сек";
  }

  if (normalizedSeconds < 60) {
    return `~${normalizedSeconds} сек`;
  }

  const minutes = Math.floor(normalizedSeconds / 60);
  const remainingSeconds = normalizedSeconds % 60;

  return remainingSeconds ? `~${minutes} мин ${remainingSeconds} сек` : `~${minutes} мин`;
}
