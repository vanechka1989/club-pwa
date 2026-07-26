const majorUnitPattern = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export class PaymentMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentMoneyError";
  }
}

export function majorToMinor(value: number | string): number {
  const source = typeof value === "number"
    ? Number.isFinite(value) && value >= 0 ? value.toString() : ""
    : value;
  const match = majorUnitPattern.exec(source);
  if (!match) throw new PaymentMoneyError("Invalid major-unit amount");

  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  const minor = whole * 100n + fraction;
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new PaymentMoneyError("Invalid major-unit amount");
  }
  return Number(minor);
}

export function minorToMajor(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PaymentMoneyError("Invalid minor-unit amount");
  }
  return Number((value / 100).toFixed(2));
}
