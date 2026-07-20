export type MailingDeliveryFailureKind = "temporary" | "permanent";

export type MailingRetryDecision = {
  status: "pending" | "failed";
  nextAttemptAt: Date | null;
  error: string;
};

const retryDelayMsByAttempt = new Map([
  [1, 60_000],
  [2, 5 * 60_000]
]);

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "";
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }
  for (const key of ["status", "statusCode", "code"] as const) {
    const value = error[key as keyof typeof error];
    if (typeof value === "number") {
      return value;
    }
  }
  return null;
}

export function classifyMailingDeliveryError(error: unknown): MailingDeliveryFailureKind {
  const status = getErrorStatus(error);
  if (status === 408 || status === 425 || status === 429 || (status !== null && status >= 500)) {
    return "temporary";
  }

  const message = getErrorMessage(error);
  if (
    /(?:invalid|missing|unknown).*(?:recipient|address|email)|(?:recipient|address|email).*(?:invalid|missing|unknown|unsubscrib|blocked|reject|unavailable)|unsubscrib|blocked|\b(?:550|551|553|554)\b/i.test(
      message
    )
  ) {
    return "permanent";
  }

  return "temporary";
}

export function getMailingRetryDecision(attemptCount: number, error: unknown, now = new Date()): MailingRetryDecision {
  if (classifyMailingDeliveryError(error) === "permanent") {
    return { status: "failed", nextAttemptAt: null, error: "Получатель недоступен" };
  }

  const retryDelayMs = retryDelayMsByAttempt.get(attemptCount);
  if (!retryDelayMs) {
    return { status: "failed", nextAttemptAt: null, error: "Доставка не удалась после 3 попыток" };
  }

  return {
    status: "pending",
    nextAttemptAt: new Date(now.getTime() + retryDelayMs),
    error: "Временная ошибка доставки"
  };
}

export function getStaleMailingProcessingCutoff(now = new Date()) {
  return new Date(now.getTime() - 10 * 60_000);
}
