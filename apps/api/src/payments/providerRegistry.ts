import type { PaymentProviderCode } from "@club/shared";
import { lavaAdapter } from "./lava";
import { prodamusAdapter } from "./prodamusAdapter";
import type { PaymentProviderAdapter } from "./providerAdapter";

const adapters = new Map<PaymentProviderCode, PaymentProviderAdapter>([
  ["prodamus", prodamusAdapter],
  ["lava", lavaAdapter]
]);

export function getPaymentProviderAdapter(code: PaymentProviderCode) {
  const adapter = adapters.get(code);
  if (!adapter) {
    throw new Error(`Payment provider adapter is not registered: ${code}`);
  }
  return adapter;
}
