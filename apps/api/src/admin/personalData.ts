type ClientContact = {
  email: string | null;
  phone: string | null;
  phoneSource: "prodamus" | "lava" | null;
  phoneUpdatedAt: Date | null;
};

export function normalizeClientPhone(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const input = String(value).trim();
  if (!input) return null;
  const leadingPlus = input.startsWith("+");
  const digits = input.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `${leadingPlus ? "+" : ""}${digits}`;
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function extractVerifiedPaymentPhone(provider: "prodamus" | "lava", payload: Record<string, unknown>) {
  const buyer = recordValue(payload.buyer);
  const value = provider === "prodamus"
    ? payload.customer_phone ?? payload.customerPhone
    : buyer?.phone ?? payload.customer_phone ?? payload.customerPhone;
  const phone = normalizeClientPhone(value);
  return phone ? { phone, phoneSource: provider } as const : null;
}

export function protectClientContact(contact: ClientContact, allowed: boolean) {
  if (!allowed) {
    return {
      email: null,
      phone: null,
      phoneSource: null,
      phoneUpdatedAt: null,
      personalDataRestricted: true
    } as const;
  }

  return {
    email: contact.email,
    phone: contact.phone,
    phoneSource: contact.phoneSource,
    phoneUpdatedAt: contact.phoneUpdatedAt?.toISOString() ?? null,
    personalDataRestricted: false
  } as const;
}
