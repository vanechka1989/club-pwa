export function redactSensitiveRequestPath(path: string) {
  return path.replace(
    /(^|\/)payments\/offers\/[A-Za-z0-9_-]{20,}(?=\/|[?#]|$)/g,
    "$1payments/offers/[redacted]"
  );
}
