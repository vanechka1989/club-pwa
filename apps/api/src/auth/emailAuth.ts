import { createHash, randomInt } from "node:crypto";

const loginCodeLength = 6;
export const emailLoginCodeCooldownSeconds = 60;
export const pwaStandaloneAuthHeaderName = "X-Club-PWA-Standalone";
export const pwaInstallRequiredMessage = "Вход по email доступен только из установленного приложения.";

export function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase();
  if (!email || email.length > 320) {
    return null;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function createLoginCode() {
  return String(randomInt(0, 10 ** loginCodeLength)).padStart(loginCodeLength, "0");
}

export function hashAuthToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function getEmailLoginCodeCooldownSeconds(issuedAt: Date | null | undefined, now = new Date()) {
  if (!issuedAt) {
    return 0;
  }

  const elapsedMs = now.getTime() - issuedAt.getTime();
  const remainingMs = emailLoginCodeCooldownSeconds * 1000 - elapsedMs;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function hasPwaStandaloneAuthHeader(value: string | null | undefined) {
  return value === "1";
}

function normalizePublicWebOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Email web origin must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildEmailLoginMessage(input: { code: string; expiresInMinutes: number; webOrigin: string }) {
  if (!/^\d{6}$/.test(input.code)) {
    throw new Error("Email login code must contain exactly six digits");
  }

  const webOrigin = normalizePublicWebOrigin(input.webOrigin);
  const safeLogoUrl = escapeHtml(`${webOrigin}/icons/icon-192.png`);
  const displayCode = input.code;
  const expirationText = `${input.expiresInMinutes} минут`;

  return {
    subject: "Код входа в клуб",
    text: [
      `Ваш код входа: ${input.code}`,
      "",
      `Он действует ${expirationText}.`,
      "",
      "Если вы не запрашивали вход, просто проигнорируйте это письмо."
    ].join("\n"),
    html: `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Код входа в Club</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f6f4;color:#14231f;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Код для входа в Club. Действует ${expirationText}.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f1f6f4;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:32px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #d8e4df;border-radius:24px;border-collapse:separate;overflow:hidden;box-shadow:0 14px 36px rgba(23,64,53,0.10);">
            <tr>
              <td style="padding:28px 28px 22px;background:#0f2e26;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding-right:14px;vertical-align:middle;">
                      <img src="${safeLogoUrl}" width="56" height="56" alt="Club" style="display:block;width:56px;height:56px;border:0;border-radius:16px;object-fit:cover;" />
                    </td>
                    <td style="vertical-align:middle;">
                      <div style="color:#ffffff;font-size:22px;line-height:28px;font-weight:800;">Club</div>
                      <div style="margin-top:3px;color:#b9d2c9;font-size:13px;line-height:18px;">Безопасный вход в приложение</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 28px;">
                <h1 style="margin:0;color:#14231f;font-size:28px;line-height:34px;font-weight:800;">Код для входа</h1>
                <p style="margin:10px 0 0;color:#60716b;font-size:16px;line-height:24px;">Введите эти 6 цифр в приложении Club.</p>

                <div style="margin:24px 0 0;padding:21px 14px;background:#edf9f6;border:2px solid #19bdaa;border-radius:18px;color:#0d3a31;font-family:'Courier New',Courier,monospace;font-size:38px;line-height:44px;font-weight:800;letter-spacing:8px;text-align:center;white-space:nowrap;user-select:all;-webkit-user-select:all;">${displayCode}</div>
                <p style="margin:10px 0 0;color:#74847f;font-size:13px;line-height:19px;text-align:center;">Скопируйте код для авторизации в клубе</p>

                <div style="margin:24px 0 0;padding:16px 17px;background:#fff8e7;border:1px solid #ead59a;border-radius:14px;color:#65511c;font-size:14px;line-height:21px;">
                  <strong style="display:block;margin-bottom:4px;color:#4d3c0f;">Код действует ${expirationText}</strong>
                  Если вы не запрашивали вход, ничего делать не нужно — просто проигнорируйте это письмо.
                </div>

                <p style="margin:24px 0 0;color:#8a9893;font-size:12px;line-height:18px;text-align:center;">Это автоматическое письмо от Club. Отвечать на него не нужно.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
  };
}
