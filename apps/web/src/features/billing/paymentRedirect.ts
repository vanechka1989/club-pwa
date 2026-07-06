export type PaymentCheckoutTarget = {
  open?: (url: string, target?: string, features?: string) => unknown;
  location?: {
    assign: (url: string) => void;
  };
};

export type PaymentCheckoutOpenResult = "window" | "location";

export function openPaymentCheckoutUrl(
  checkoutUrl: string,
  target: PaymentCheckoutTarget = window
): PaymentCheckoutOpenResult {
  const opened = target.open?.(checkoutUrl, "_blank", "noopener,noreferrer");
  if (opened) {
    return "window";
  }

  target.location?.assign(checkoutUrl);
  return "location";
}
