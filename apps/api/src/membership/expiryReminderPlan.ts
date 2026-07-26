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

export function buildExpiryReminderMessage(stage: ExpiryReminderStage, expiresAt: Date) {
  const date = expiryDateFormatter.format(expiresAt);
  const title =
    stage === "three-days"
      ? "Доступ закончится через 3 дня"
      : stage === "one-day"
        ? "Доступ закончится завтра"
        : "Доступ заканчивается сегодня";
  const body = `${title}. Доступ действует до ${date} Откройте приложение, чтобы выбрать вариант продления.`;
  const emailText = `${title}\n\nДоступ действует до ${date}\n\nОткройте установленное приложение Club PWA, чтобы посмотреть доступные варианты продления.\n\nЭто системное уведомление.`;
  const safeTitle = escapeHtml(title);
  const safeDate = escapeHtml(date);

  return {
    title,
    body,
    pwaHtml: `<p>${escapeHtml(body)}</p><p><a href="/payments">Открыть оплату в приложении</a></p>`,
    emailText,
    emailHtml: `<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:0;background:#eef7f3;color:#16322c;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#eef7f3;border-collapse:collapse">
      <tr>
        <td align="center" style="padding:24px 12px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #cfe4dc;border-radius:22px;border-collapse:separate;overflow:hidden">
            <tr>
              <td style="padding:24px 28px;background:#0d3b32;color:#ffffff">
                <div style="font-size:12px;line-height:18px;letter-spacing:1.2px;text-transform:uppercase;color:#8ce9d8;font-weight:700">Club PWA · системное уведомление</div>
                <div style="margin-top:8px;font-size:26px;line-height:32px;font-weight:800">${safeTitle}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px">
                <div style="font-size:14px;line-height:20px;color:#678078">Дата окончания доступа</div>
                <div style="margin-top:6px;padding:14px 16px;border-radius:14px;background:#e5faf5;color:#075e50;font-size:20px;line-height:26px;font-weight:800">${safeDate}</div>
                <p style="margin:24px 0 0;font-size:16px;line-height:24px;color:#29443d">Чтобы продолжить пользоваться материалами клуба, откройте установленное приложение и выберите подходящий вариант продления.</p>
                <div style="margin-top:22px;padding:14px 16px;border-left:4px solid #20cdb5;border-radius:10px;background:#f4faf8;color:#47645c;font-size:14px;line-height:21px">Откройте установленное приложение Club PWA. В этом письме специально нет кнопок и внешних ссылок.</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;border-top:1px solid #e1eee9;color:#789087;font-size:12px;line-height:18px">Письмо отправлено автоматически. Отвечать на него не нужно.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
  };
}

export const membershipExpiryReminderTimeZone = PROJECT_TIME_ZONE;
