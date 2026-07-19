function normalizeAuditText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function distinctAuditDetails(title: string, summary: string) {
  const details = summary.trim();
  if (!details || normalizeAuditText(details) === normalizeAuditText(title)) {
    return null;
  }
  return details;
}
