import { normalizeProdamusWebhookPayload } from "./prodamus";

export type ProdamusWebhookAction = "reject" | "ignore" | "process";
export type ProdamusWebhookPaymentStatus = "paid" | "failed" | "ignore";

export const prodamusWebhookMaxBodyBytes = 64 * 1024;

export class ProdamusWebhookRequestError extends Error {
  constructor(public readonly status: 400 | 413 | 415, message: string) {
    super(message);
    this.name = "ProdamusWebhookRequestError";
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function classifyProdamusWebhookPaymentStatus(payload: Record<string, unknown>): ProdamusWebhookPaymentStatus {
  const status = stringValue(payload.payment_status ?? payload.status).toLowerCase();
  if (["success", "paid", "completed", "оплачен", "оплачено"].includes(status)) return "paid";
  if (["failed", "cancelled", "canceled", "declined", "error", "отменен", "отменён"].includes(status)) return "failed";
  return "ignore";
}

export function validateProdamusWebhookOrder(
  payload: Record<string, unknown>,
  expected: { amountRub: number; productTitle: string }
) {
  const firstProduct = Array.isArray(payload.products) ? payload.products[0] : null;
  if (!firstProduct || typeof firstProduct !== "object" || Array.isArray(firstProduct)) return false;
  const product = firstProduct as Record<string, unknown>;
  const price = Number(stringValue(product.price).replace(",", "."));
  const quantity = Number(stringValue(product.quantity));
  const title = stringValue(product.name);
  return Number.isFinite(price) && price === expected.amountRub && quantity === 1 && title === expected.productTitle;
}

export async function parseProdamusWebhookRequest(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > prodamusWebhookMaxBodyBytes) {
    throw new ProdamusWebhookRequestError(413, "Webhook body is too large");
  }

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    throw new ProdamusWebhookRequestError(415, "Unsupported webhook content type");
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > prodamusWebhookMaxBodyBytes) {
    throw new ProdamusWebhookRequestError(413, "Webhook body is too large");
  }
  const rawBody = new TextDecoder().decode(bytes);

  let payload: Record<string, unknown>;
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid JSON object");
      payload = parsed as Record<string, unknown>;
    } catch {
      throw new ProdamusWebhookRequestError(400, "Invalid webhook JSON");
    }
  } else if (!contentType || contentType.includes("application/x-www-form-urlencoded")) {
    payload = Object.fromEntries(new URLSearchParams(rawBody));
  } else {
    throw new ProdamusWebhookRequestError(415, "Unsupported webhook content type");
  }

  return normalizeProdamusWebhookPayload(payload);
}

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
