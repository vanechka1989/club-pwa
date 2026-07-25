export type ExpiryReminderStage = "three-days" | "one-day" | "expiry-day";

const PROJECT_TIME_ZONE = "Asia/Novosibirsk";

type ProjectDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

const projectDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: PROJECT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23"
});

const expiryDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  timeZone: PROJECT_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric"
});

function projectDateTime(value: Date): ProjectDateTime {
  const parts = Object.fromEntries(
    projectDateTimeFormatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 0,
    day: parts.day ?? 0,
    hour: parts.hour ?? 0
  };
}

function calendarOrdinal(value: ProjectDateTime) {
  return Math.floor(Date.UTC(value.year, value.month - 1, value.day) / 86_400_000);
}

export function getDueExpiryReminderStages(expiresAt: Date, now: Date): ExpiryReminderStage[] {
  if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(now.getTime()) || now >= expiresAt) return [];

  const expiry = projectDateTime(expiresAt);
  const current = projectDateTime(now);
  if (current.hour < 10) return [];

  const daysRemaining = calendarOrdinal(expiry) - calendarOrdinal(current);
  if (daysRemaining === 3) return ["three-days"];
  if (daysRemaining === 1) return ["one-day"];
  if (daysRemaining === 0) return ["expiry-day"];
  return [];
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    return "&#39;";
  });
}

export function buildExpiryReminderMessage(
  stage: ExpiryReminderStage,
  expiresAt: Date,
  renewalUrl = "/payments"
) {
  const date = expiryDateFormatter.format(expiresAt);
  const title =
    stage === "three-days"
      ? "Доступ закончится через 3 дня"
      : stage === "one-day"
        ? "Доступ закончится завтра"
        : "Доступ заканчивается сегодня";
  const body = `${title}. Доступ действует до ${date}. Продлите его, чтобы продолжить пользоваться клубом.`;
  const safeUrl = escapeHtml(renewalUrl);

  return {
    title,
    body,
    emailHtml: `<p>${escapeHtml(body)}</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#16cdb7;color:#06231f;text-decoration:none;font-weight:700">Продлить доступ</a></p>`
  };
}

export const membershipExpiryReminderTimeZone = PROJECT_TIME_ZONE;
