export type ProdamusWebhookAction = "reject" | "ignore" | "process";

export function decideProdamusWebhookAction(input: {
  providerConfigured: boolean;
  isValidSignature: boolean;
  orderId: string | null;
  orderFound: boolean;
}): { action: ProdamusWebhookAction; status: 200 | 400 } {
  if (!input.providerConfigured || !input.isValidSignature || !input.orderId) {
    return { action: "reject", status: 400 };
  }

  if (!input.orderFound) {
    return { action: "ignore", status: 200 };
  }

  return { action: "process", status: 200 };
}

export function getProdamusWebhookSuccessResponse() {
  return "success";
}
