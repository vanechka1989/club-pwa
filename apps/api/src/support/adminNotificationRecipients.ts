type SupportAdminRecipient = {
  telegramId: string;
  isActive: boolean;
  permissions: unknown;
};

export function selectSupportAdminTelegramIds(input: {
  ownerTelegramId: string;
  admins: SupportAdminRecipient[];
}) {
  const recipients: string[] = [];
  const seen = new Set<string>();

  const addRecipient = (telegramId: string) => {
    const normalizedId = telegramId.trim().toLowerCase();
    if (!normalizedId || seen.has(normalizedId)) {
      return;
    }
    seen.add(normalizedId);
    recipients.push(telegramId);
  };

  addRecipient(input.ownerTelegramId);
  for (const admin of input.admins) {
    if (!admin.isActive || !Array.isArray(admin.permissions) || !admin.permissions.includes("support")) {
      continue;
    }
    addRecipient(admin.telegramId);
  }

  return recipients;
}
