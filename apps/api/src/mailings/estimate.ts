const pushBatchSize = 20;
const pushBatchIntervalSeconds = 5;
const emailsPerSecond = 2;

export function estimateMailingDurationSeconds({
  pushCount,
  emailCount
}: {
  pushCount: number;
  emailCount: number;
}) {
  const normalizedPushCount = Math.max(0, Math.floor(pushCount));
  const normalizedEmailCount = Math.max(0, Math.floor(emailCount));
  const pushSeconds = Math.ceil(normalizedPushCount / pushBatchSize) * pushBatchIntervalSeconds;
  const emailSeconds = Math.ceil(normalizedEmailCount / emailsPerSecond);
  return pushSeconds + emailSeconds;
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
