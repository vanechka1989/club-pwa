export type PaymentDiagnosticState =
  | "paid"
  | "awaiting_payment"
  | "expired"
  | "failed"
  | "cancelled"
  | "webhook_error";

export type PaymentDiagnostic = {
  state: PaymentDiagnosticState;
  reason: string;
  severity: "success" | "info" | "warning" | "danger";
};

type PaymentDiagnosticInput = {
  status: "pending" | "paid" | "failed" | "cancelled";
  createdAt: Date;
  updatedAt: Date;
  webhook: { isValid: boolean; createdAt: Date } | null;
  now?: Date;
  pendingExpiryMs?: number;
};

export function buildPaymentDiagnostic(input: PaymentDiagnosticInput): PaymentDiagnostic {
  if (input.webhook && !input.webhook.isValid) {
    return { state: "webhook_error", reason: "Платёжный webhook не прошёл проверку подписи.", severity: "danger" };
  }
  if (input.status === "paid") return { state: "paid", reason: "Оплата подтверждена.", severity: "success" };
  if (input.status === "failed") return { state: "failed", reason: "Платёж завершился ошибкой.", severity: "danger" };
  if (input.status === "cancelled") return { state: "cancelled", reason: "Платёж отменён.", severity: "warning" };

  const now = input.now ?? new Date();
  const pendingExpiryMs = input.pendingExpiryMs ?? 24 * 60 * 60_000;
  if (now.getTime() - input.createdAt.getTime() >= pendingExpiryMs) {
    return { state: "expired", reason: "Ссылка оплаты открыта, но подтверждение не получено за 24 часа.", severity: "warning" };
  }
  if (input.webhook?.isValid) {
    return { state: "webhook_error", reason: "Webhook получен, но заказ остался в ожидании.", severity: "danger" };
  }
  return { state: "awaiting_payment", reason: "Клиент перешёл к оплате, подтверждения ещё нет.", severity: "info" };
}

export function summarizePaymentDiagnostics(diagnostics: PaymentDiagnostic[]) {
  return diagnostics.reduce(
    (summary, diagnostic) => {
      summary.total += 1;
      if (diagnostic.state === "paid") summary.paid += 1;
      if (diagnostic.state === "awaiting_payment") summary.awaitingPayment += 1;
      if (diagnostic.state === "expired") summary.expired += 1;
      if (diagnostic.state === "failed") summary.failed += 1;
      if (diagnostic.state === "cancelled") summary.cancelled += 1;
      if (diagnostic.state === "webhook_error") summary.webhookErrors += 1;
      return summary;
    },
    { total: 0, paid: 0, awaitingPayment: 0, expired: 0, failed: 0, cancelled: 0, webhookErrors: 0 }
  );
}
