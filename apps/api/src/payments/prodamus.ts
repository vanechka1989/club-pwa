import { createHmac, timingSafeEqual } from "node:crypto";

type ProdamusPrimitive = string | number | boolean | null;
type ProdamusValue = ProdamusPrimitive | ProdamusValue[] | { [key: string]: ProdamusValue | undefined };

export type PaymentProductForProdamus = {
  title: string;
  amountRub: number;
  kind: "one_time" | "recurrent";
  accessDays: number;
  prodamusSubscriptionId: string | null;
};

export function normalizeProdamusFormUrl(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const url = new URL(withProtocol);
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  return url.toString();
}

function sanitizeForSignature(value: unknown): ProdamusValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForSignature).filter((entry) => entry !== undefined) as ProdamusValue[];
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, sanitizeForSignature(entry)] as const)
        .filter(([, entry]) => entry !== undefined)
    );
  }

  return String(value);
}

function sortForSignature(value: ProdamusValue): ProdamusValue {
  if (Array.isArray(value)) {
    return value.map(sortForSignature);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, entry]) => key !== "signature" && entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortForSignature(entry as ProdamusValue)])
    );
  }

  return value;
}

export function createProdamusSignature(data: Record<string, unknown>, secretKey: string) {
  const normalized = sortForSignature(sanitizeForSignature(data) as ProdamusValue);
  return createHmac("sha256", secretKey).update(JSON.stringify(normalized)).digest("hex");
}

export function verifyProdamusSignature(data: Record<string, unknown>, secretKey: string, signature: string | null | undefined) {
  if (!signature) {
    return false;
  }

  const expected = createProdamusSignature(data, secretKey);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function buildProdamusPaymentUrl(input: {
  formUrl: string;
  secretKey: string;
  sys: string;
  orderId: string;
  userTelegramId: string;
  product: PaymentProductForProdamus;
  returnUrl: string;
}) {
  const data: Record<string, ProdamusValue | undefined> = {
    do: "pay",
    order_id: input.orderId,
    customer_extra: `telegram:${input.userTelegramId}`,
    sys: input.sys,
    urlReturn: input.returnUrl,
    urlSuccess: input.returnUrl,
    products: [
      {
        name: input.product.title,
        price: input.product.amountRub,
        quantity: 1,
        type: "course"
      }
    ],
    subscription: input.product.kind === "recurrent" ? input.product.prodamusSubscriptionId : undefined
  };
  const signature = createProdamusSignature(data, input.secretKey);
  const url = new URL(normalizeProdamusFormUrl(input.formUrl));

  url.searchParams.set("do", String(data.do));
  url.searchParams.set("order_id", String(data.order_id));
  url.searchParams.set("customer_extra", String(data.customer_extra));
  url.searchParams.set("sys", input.sys);
  url.searchParams.set("urlReturn", input.returnUrl);
  url.searchParams.set("urlSuccess", input.returnUrl);
  url.searchParams.set("products[0][name]", input.product.title);
  url.searchParams.set("products[0][price]", String(input.product.amountRub));
  url.searchParams.set("products[0][quantity]", "1");
  url.searchParams.set("products[0][type]", "course");
  if (input.product.kind === "recurrent" && input.product.prodamusSubscriptionId) {
    url.searchParams.set("subscription", input.product.prodamusSubscriptionId);
  }
  url.searchParams.set("signature", signature);

  return url.toString();
}
