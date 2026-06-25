import { createHmac, timingSafeEqual } from "node:crypto";

type ProdamusPrimitive = string | number | boolean | null;
type ProdamusValue = ProdamusPrimitive | ProdamusValue[] | { [key: string]: ProdamusValue | undefined };
type ProdamusSignatureValue = string | ProdamusSignatureValue[] | { [key: string]: ProdamusSignatureValue };

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

function splitBracketKey(key: string) {
  const parts: string[] = [];
  key.replace(/([^[\]]+)|\[([^\]]*)\]/g, (_match, plain: string | undefined, bracket: string | undefined) => {
    parts.push(plain ?? bracket ?? "");
    return "";
  });
  return parts.length ? parts : [key];
}

function isArrayIndex(value: string) {
  return /^\d+$/.test(value);
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return Boolean(value) && typeof value === "object";
}

function setNestedValue(target: Record<string, unknown>, parts: string[], value: unknown) {
  let cursor: Record<string, unknown> | unknown[] = target;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? "";
    const isLast = index === parts.length - 1;
    const nextPart = parts[index + 1] ?? "";

    if (Array.isArray(cursor)) {
      const arrayIndex = Number(part);
      if (isLast) {
        cursor[arrayIndex] = value;
        return;
      }

      if (!isContainer(cursor[arrayIndex])) {
        cursor[arrayIndex] = isArrayIndex(nextPart) ? [] : {};
      }
      cursor = cursor[arrayIndex] as Record<string, unknown> | unknown[];
      continue;
    }

    if (isLast) {
      cursor[part] = value;
      return;
    }

    if (!isContainer(cursor[part])) {
      cursor[part] = isArrayIndex(nextPart) ? [] : {};
    }
    cursor = cursor[part] as Record<string, unknown> | unknown[];
  }
}

export function normalizeProdamusWebhookPayload(payload: Record<string, unknown>) {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (key.includes("[")) {
      setNestedValue(normalized, splitBracketKey(key), value);
    } else {
      normalized[key] = value;
    }
  }

  return normalized;
}

export function getProdamusNotificationOrderId(payload: Record<string, unknown>) {
  const value = payload.order_num ?? payload.orderId ?? payload.order_id;
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function sanitizeForSignature(value: unknown): ProdamusSignatureValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForSignature).filter((entry) => entry !== undefined) as ProdamusSignatureValue[];
  }
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, sanitizeForSignature(entry)] as const)
      .filter((entry): entry is readonly [string, ProdamusSignatureValue] => entry[1] !== undefined);
    return Object.fromEntries(entries);
  }

  return String(value);
}

function sortForSignature(value: ProdamusSignatureValue): ProdamusSignatureValue {
  if (Array.isArray(value)) {
    return value.map(sortForSignature);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, entry]) => key !== "signature" && entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortForSignature(entry as ProdamusSignatureValue)])
    );
  }

  return value;
}

export function createProdamusSignature(data: Record<string, unknown>, secretKey: string) {
  const normalized = sortForSignature(sanitizeForSignature(data) as ProdamusSignatureValue);
  const payload = JSON.stringify(normalized).replace(/\//g, "\\/");
  return createHmac("sha256", secretKey).update(payload).digest("hex");
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
  notificationUrl: string;
  subscriptionDateStart?: Date;
}) {
  const products = [
    {
      name: input.product.title,
      price: input.product.amountRub,
      quantity: 1,
      type: "course"
    }
  ];
  const subscriptionDateStart =
    input.product.kind === "recurrent" ? formatProdamusDateTime(input.subscriptionDateStart ?? new Date()) : undefined;
  const data: Record<string, ProdamusValue | undefined> = {
    do: "pay",
    order_id: input.orderId,
    customer_extra: `telegram:${input.userTelegramId}`,
    _param_telegram_id: input.userTelegramId,
    sys: input.sys || undefined,
    urlReturn: input.returnUrl,
    urlSuccess: input.returnUrl,
    urlNotification: input.notificationUrl,
    callbackType: "json",
    products,
    subscription: input.product.kind === "recurrent" ? input.product.prodamusSubscriptionId : undefined,
    subscription_date_start: subscriptionDateStart
  };
  const signature = createProdamusSignature(data, input.secretKey);
  const url = new URL(normalizeProdamusFormUrl(input.formUrl));

  url.searchParams.set("do", String(data.do));
  url.searchParams.set("order_id", String(data.order_id));
  url.searchParams.set("customer_extra", String(data.customer_extra));
  url.searchParams.set("_param_telegram_id", input.userTelegramId);
  if (input.sys) {
    url.searchParams.set("sys", input.sys);
  }
  url.searchParams.set("urlReturn", input.returnUrl);
  url.searchParams.set("urlSuccess", input.returnUrl);
  url.searchParams.set("urlNotification", input.notificationUrl);
  url.searchParams.set("callbackType", "json");
  url.searchParams.set("products[0][name]", input.product.title);
  url.searchParams.set("products[0][price]", String(input.product.amountRub));
  url.searchParams.set("products[0][quantity]", "1");
  url.searchParams.set("products[0][type]", "course");
  if (input.product.kind === "recurrent" && input.product.prodamusSubscriptionId) {
    url.searchParams.set("subscription", input.product.prodamusSubscriptionId);
    if (subscriptionDateStart) {
      url.searchParams.set("subscription_date_start", subscriptionDateStart);
    }
  }
  url.searchParams.set("signature", signature);

  return url.toString();
}

function formatProdamusDateTime(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function buildProdamusSetActivityRequest(input: {
  formUrl: string;
  secretKey: string;
  subscriptionId: string;
  profileId?: string | null;
  telegramId?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  activeManager: boolean;
}) {
  const identity = pickSetActivityIdentity(input);
  const data = {
    subscription: input.subscriptionId,
    ...identity,
    active_manager: input.activeManager ? 1 : 0
  };
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    body.set(key, String(value));
  }
  body.set("signature", createProdamusSignature(data, input.secretKey));

  const url = new URL("rest/setActivity/", normalizeProdamusFormUrl(input.formUrl)).toString();
  return { url, body };
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function getProdamusSubscriptionIdentity(payload: Record<string, unknown> | null | undefined, fallbackTelegramId?: string | null) {
  const subscription = objectValue(payload?.subscription);
  return {
    profileId: stringValue(subscription?.profile_id || subscription?.profileId) || null,
    customerEmail: stringValue(payload?.customer_email || payload?.customerEmail) || null,
    customerPhone: stringValue(payload?.customer_phone || payload?.customerPhone) || null,
    telegramId: stringValue(fallbackTelegramId) || null
  };
}

function pickSetActivityIdentity(input: {
  profileId?: string | null;
  telegramId?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
}) {
  const profileId = stringValue(input.profileId);
  if (profileId) {
    return { profile: profileId };
  }

  const customerEmail = stringValue(input.customerEmail);
  if (customerEmail) {
    return { customer_email: customerEmail };
  }

  const customerPhone = stringValue(input.customerPhone);
  if (customerPhone) {
    return { customer_phone: customerPhone };
  }

  const telegramId = stringValue(input.telegramId);
  if (telegramId) {
    return { tg_user_id: telegramId };
  }

  throw new Error("Prodamus setActivity identity is missing");
}

export async function setProdamusSubscriptionActivity(input: {
  formUrl: string;
  secretKey: string;
  subscriptionId: string;
  profileId?: string | null;
  telegramId?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  activeManager: boolean;
  fetchImpl?: typeof fetch;
}) {
  const request = buildProdamusSetActivityRequest(input);
  const fetcher = input.fetchImpl ?? fetch;
  const response = await fetcher(request.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: request.body
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Prodamus setActivity failed: ${response.status} ${text}`.trim());
  }
}
