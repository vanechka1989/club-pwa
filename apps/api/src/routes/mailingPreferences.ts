import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { db } from "../db/client";
import { users } from "../db/schema";
import { verifyMailingUnsubscribeToken } from "../mailings/unsubscribe";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

function page(title: string, message: string, actions = "") {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;padding:20px;background:#f4ede7;color:#29211d;font-family:system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}.card{width:min(100%,480px);padding:28px;border:1px solid #d9c8bc;border-radius:24px;background:#fffaf7;box-shadow:0 16px 48px #3b2d2214}h1{font-size:24px;line-height:1.2;margin:0 0 12px}p{font-size:16px;line-height:1.5;margin:0;color:#6d5f57}.actions{display:grid;gap:10px;margin-top:24px}button,a{display:grid;min-height:48px;place-items:center;border-radius:14px;font:700 15px/1 system-ui,sans-serif;text-decoration:none}button{border:1px solid #b84b3d;background:#c95747;color:#fff;cursor:pointer}a{border:1px solid #d9c8bc;background:#fff;color:#50443d}</style></head><body><main class="card"><h1>${title}</h1><p>${message}</p>${actions}</main></body></html>`;
}

function verifyToken(token: string) {
  try {
    return verifyMailingUnsubscribeToken(token);
  } catch {
    return null;
  }
}

function invalidLink(c: Context) {
  return c.html(page("Ссылка недействительна", "Проверьте ссылку из письма или обратитесь в поддержку."), 400);
}

async function showUnsubscribeConfirmation(c: Context) {
  const token = c.req.query("token") ?? "";
  if (!verifyToken(token)) {
    return invalidLink(c);
  }

  const actions = `<form class="actions" method="post" action="/api/mailings/unsubscribe"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Отписаться от рассылок</button><a href="/">Не отписываться</a></form>`;
  return c.html(
    page(
      "Отписаться от email-рассылок?",
      "Клубные письма с новостями больше не будут приходить. Push и уведомления в приложении останутся включены. Коды входа продолжат приходить.",
      actions
    )
  );
}

async function confirmMailingUnsubscribe(c: Context) {
  let token = c.req.query("token") ?? "";
  if (!token) {
    const form = await c.req.formData().catch(() => null);
    const formToken = form?.get("token");
    token = typeof formToken === "string" ? formToken : "";
  }
  const userId = verifyToken(token);
  if (!userId) {
    return invalidLink(c);
  }

  await db
    .update(users)
    .set({ marketingEmailOptOutAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
  return c.html(page("Вы отписались", "Рассылки клуба больше не будут приходить на ваш email. Системные письма с кодами входа продолжат работать."));
}

export const mailingPreferencesRoute = new Hono()
  .get("/unsubscribe", showUnsubscribeConfirmation)
  .post("/unsubscribe", confirmMailingUnsubscribe);
