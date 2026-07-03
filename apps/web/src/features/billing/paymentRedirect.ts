type TelegramCheckoutWebApp = {
  openLink?: (url: string, options?: { try_instant_view?: boolean }) => void;
};

export type PaymentCheckoutTarget = {
  Telegram?: {
    WebApp?: TelegramCheckoutWebApp;
  };
  open?: (url: string, target?: string, features?: string) => unknown;
  location?: {
    assign: (url: string) => void;
  };
};

export type PaymentCheckoutOpenResult = "telegram" | "window" | "location";

export function openPaymentCheckoutUrl(
  checkoutUrl: string,
  target: PaymentCheckoutTarget = window
): PaymentCheckoutOpenResult {
  const openLink = target.Telegram?.WebApp?.openLink;

  if (openLink) {
    try {
      openLink(checkoutUrl, { try_instant_view: false });
      return "telegram";
    } catch {
      // Fall back to the browser path below.
    }
  }

  const opened = target.open?.(checkoutUrl, "_blank", "noopener,noreferrer");
  if (opened) {
    return "window";
  }

  target.location?.assign(checkoutUrl);
  return "location";
}
