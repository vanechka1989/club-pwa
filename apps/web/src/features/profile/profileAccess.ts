import type { CurrentAccess } from "@club/shared";
import type { Locale } from "@/features/app/i18n";

const renewalWindowMs = 3 * 24 * 60 * 60 * 1000;

export function shouldShowProfilePaymentAction({
  isMember,
  expiresAt,
  source,
  now = new Date()
}: {
  isMember: boolean;
  expiresAt: string | null;
  source: CurrentAccess["source"] | null;
  now?: Date;
}) {
  if (!isMember) return true;
  if (source === "recurrent") return false;
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - now.getTime() <= renewalWindowMs;
}

export function maskProfileEmail(email: string | null | undefined, locale: Locale = "ru") {
  if (!email) return locale === "ru" ? "Не указан" : "Not specified";
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 1)}•••@${domain}`;
}

function formatDays(days: number, locale: Locale) {
  if (locale === "en") return `${days} ${days === 1 ? "day" : "days"}`;
  const mod10 = days % 10;
  const mod100 = days % 100;
  const unit = mod10 === 1 && mod100 !== 11 ? "день" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "дня" : "дней";
  return `${days} ${unit}`;
}

function formatAccessDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

export function getProfileAccessMetaText(access: CurrentAccess, locale: Locale) {
  if (access.source === "one_time") {
    return access.accessDays
      ? `${locale === "ru" ? "Разовый платёж" : "One-time payment"} · ${formatDays(access.accessDays, locale)}`
      : locale === "ru" ? "Разовый платёж" : "One-time payment";
  }
  if (access.source === "recurrent") {
    return access.accessDays
      ? `${locale === "ru" ? "Автопродление · каждые" : "Auto-renewal · every"} ${formatDays(access.accessDays, locale)}`
      : locale === "ru" ? "Автопродление" : "Auto-renewal";
  }
  if (access.source === "gift") return locale === "ru" ? "Подарочный доступ" : "Gift access";
  if (access.source === "referral") {
    return access.bonusDays
      ? `${locale === "ru" ? "Добавлено" : "Added"} ${formatDays(access.bonusDays, locale)}`
      : locale === "ru" ? "Бонусный доступ" : "Bonus access";
  }
  return locale === "ru" ? "Доступ к клубу" : "Club access";
}

export function getProfileAccessDateText(access: CurrentAccess, locale: Locale) {
  if (access.source === "recurrent" && access.nextPaymentAt) {
    return `${locale === "ru" ? "Следующее списание" : "Next payment"} ${formatAccessDate(access.nextPaymentAt, locale)}`;
  }
  if (access.expiresAt) {
    return `${locale === "ru" ? "до" : "until"} ${formatAccessDate(access.expiresAt, locale)}`;
  }
  return locale === "ru" ? "Без ограничения срока" : "No expiration date";
}
