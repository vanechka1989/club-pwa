import type { MuteKind } from "@club/shared";

export function formatMuteDuration(kind: MuteKind, expiresAt: Date | null, now = new Date()) {
  if (kind === "permanent" || !expiresAt) {
    return "бессрочно";
  }

  const minutes = Math.max(1, Math.round((expiresAt.getTime() - now.getTime()) / 60000));
  if (minutes < 60) {
    return `${minutes} минут`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} ${hours === 1 ? "час" : "часов"}`;
  }

  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "день" : "дней"}`;
}

export function formatMuteSystemMessage({
  moderatorName,
  targetName,
  duration
}: {
  moderatorName: string;
  targetName: string;
  duration: string;
}) {
  return `${moderatorName} наложил мут на ${targetName}: ${duration}.`;
}
