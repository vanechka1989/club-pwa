function readableNumber(value: number, maximumFractionDigits = 0) {
  return value
    .toLocaleString("ru-RU", { maximumFractionDigits })
    .replace(/[\u00a0\u202f]/g, " ");
}

export function formatAdminCompactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) {
    return `${readableNumber(value / 1_000_000_000, 2)} млрд ₽`;
  }
  if (absolute >= 1_000_000) {
    return `${readableNumber(value / 1_000_000, 2)} млн ₽`;
  }
  return `${readableNumber(value)} ₽`;
}
