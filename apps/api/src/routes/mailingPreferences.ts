import { eq } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { db } from "../db/client";
import { users } from "../db/schema";
import { verifyMailingUnsubscribeToken } from "../mailings/unsubscribe";

function page(title: string, message: string) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{margin:0;background:#f4f1ec;color:#25211f;font-family:system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}.card{box-sizing:border-box;width:min(92vw,480px);padding:32px;border:1px solid #d8cec4;border-radius:24px;background:#fff;box-shadow:0 16px 48px #3b2d2214}h1{font-size:24px;margin:0 0 12px}p{font-size:16px;line-height:1.5;margin:0;color:#6d625a}</style></head><body><main class="card"><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

async function unsubscribe(c: Context) {
  const token = c.req.query("token") ?? "";
  let userId: string | null = null;
  try {
    userId = verifyMailingUnsubscribeToken(token);
  } catch {
    userId = null;
  }
  if (!userId) {
    return c.html(page("Ссылка недействительна", "Проверьте ссылку из письма или обратитесь в поддержку."), 400);
  }

  await db
    .update(users)
    .set({ marketingEmailOptOutAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
  return c.html(page("Вы отписались", "Рассылки клуба больше не будут приходить на ваш email. Системные письма для входа продолжат работать."));
}

export const mailingPreferencesRoute = new Hono().get("/unsubscribe", unsubscribe).post("/unsubscribe", unsubscribe);
