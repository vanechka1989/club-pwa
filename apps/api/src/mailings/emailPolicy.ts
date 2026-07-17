export const EMAIL_MAX_RECIPIENTS_PER_MESSAGE = 100;
export const EMAIL_DAILY_RECIPIENT_LIMIT = 2_000;
export const EMAIL_MESSAGES_PER_SECOND = 5;
export const EMAIL_RATE_INTERVAL_MS = Math.ceil(1_000 / EMAIL_MESSAGES_PER_SECOND);
export const EMAIL_QUOTA_WINDOW_MS = 24 * 60 * 60 * 1_000;

export function getEmailQuotaSnapshot({ deliveryTimes, nowMs = Date.now() }: { deliveryTimes: number[]; nowMs?: number }) {
  const cutoff = nowMs - EMAIL_QUOTA_WINDOW_MS;
  const active = deliveryTimes.filter((value) => value > cutoff).sort((a, b) => a - b);
  return {
    used: active.length,
    remaining: Math.max(0, EMAIL_DAILY_RECIPIENT_LIMIT - active.length),
    limit: EMAIL_DAILY_RECIPIENT_LIMIT,
    windowHours: 24,
    maxRecipientsPerMessage: EMAIL_MAX_RECIPIENTS_PER_MESSAGE,
    messagesPerSecond: EMAIL_MESSAGES_PER_SECOND,
    resetsAt: active.length ? new Date(active[0]! + EMAIL_QUOTA_WINDOW_MS).toISOString() : null
  };
}

export function planEmailDeliverySchedule({
  emailCount,
  existingDeliveryTimes,
  nowMs = Date.now()
}: {
  emailCount: number;
  existingDeliveryTimes: number[];
  nowMs?: number;
}) {
  const count = Math.max(0, Math.floor(emailCount));
  if (!count) {
    return { durationSeconds: 0, completesAt: new Date(nowMs).toISOString(), delayedByDailyLimit: false };
  }

  const windowStart = nowMs - EMAIL_QUOTA_WINDOW_MS;
  const timeline = existingDeliveryTimes.filter((value) => value > windowStart).sort((a, b) => a - b);
  let candidate = nowMs;
  let delayedByDailyLimit = false;

  for (let index = 0; index < count; index += 1) {
    while (true) {
      while (timeline.length && timeline[0]! <= candidate - EMAIL_QUOTA_WINDOW_MS) {
        timeline.shift();
      }
      if (timeline.length < EMAIL_DAILY_RECIPIENT_LIMIT) break;
      candidate = Math.max(candidate, timeline[0]! + EMAIL_QUOTA_WINDOW_MS + 1);
      delayedByDailyLimit = true;
    }
    timeline.push(candidate);
    if (index < count - 1) candidate += EMAIL_RATE_INTERVAL_MS;
  }

  return {
    durationSeconds: Math.max(Math.ceil(count / EMAIL_MESSAGES_PER_SECOND), Math.ceil((candidate - nowMs) / 1_000)),
    completesAt: new Date(candidate).toISOString(),
    delayedByDailyLimit
  };
}
