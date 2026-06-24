import type { MiddlewareHandler } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { env } from "../env";
import { isOwnerTelegramId } from "../admin/roles";
import { verifyTelegramInitData, type TelegramUser } from "../telegram/verifyInitData";
import { z } from "zod";
import type { UserRole } from "@club/shared";

export type AuthVariables = {
  telegramUser: TelegramUser;
  userId: string;
  previewRole: UserRole | null;
  previewMembershipStatus: "active" | "inactive" | null;
};

const previewModeSchema = z.enum(["developer", "admin", "member-active", "member-inactive"]);
type PreviewMode = z.infer<typeof previewModeSchema>;

const devTelegramUserSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().nullable().optional(),
  username: z.string().nullable().optional()
});

function getDevTelegramUser(header: string | undefined): TelegramUser | null {
  if (env.NODE_ENV !== "development" || !env.DEV_AUTH_ENABLED || !header) {
    return null;
  }

  try {
    const parsed = devTelegramUserSchema.safeParse(JSON.parse(header));
    if (!parsed.success) {
      return null;
    }

    return {
      id: parsed.data.id,
      firstName: parsed.data.firstName ?? null,
      username: parsed.data.username ?? null
    };
  } catch {
    return null;
  }
}

export const telegramAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const authorization = c.req.header("authorization");
  const initData = authorization?.startsWith("tma ") ? authorization.slice(4) : null;
  const devTelegramUser = getDevTelegramUser(c.req.header("x-dev-telegram-user"));

  if (!initData && !devTelegramUser) {
    return c.json({ error: "Telegram initData is required" }, 401);
  }

  const telegramUser = devTelegramUser ?? verifyTelegramInitData(initData ?? "", env.TELEGRAM_BOT_TOKEN);
  if (!telegramUser) {
    return c.json({ error: "Invalid Telegram initData" }, 401);
  }

  const [user] = await db
    .insert(users)
    .values({
      telegramId: telegramUser.id,
      firstName: telegramUser.firstName,
      username: telegramUser.username
    })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: {
        firstName: telegramUser.firstName,
        username: telegramUser.username,
        updatedAt: new Date()
      }
    })
    .returning();

  const resolvedUser =
    user ??
    (await db.query.users.findFirst({
      where: eq(users.telegramId, telegramUser.id)
    }));

  if (!resolvedUser) {
    return c.json({ error: "Unable to resolve user" }, 500);
  }

  c.set("telegramUser", telegramUser);
  c.set("userId", resolvedUser.id);
  c.set("previewRole", null);
  c.set("previewMembershipStatus", null);

  const previewMode = previewModeSchema.safeParse(c.req.header("x-club-preview-mode"));
  if (isOwnerTelegramId(telegramUser.id) && previewMode.success) {
    const roleByMode: Record<PreviewMode, UserRole> = {
      developer: "owner",
      admin: "admin",
      "member-active": "member",
      "member-inactive": "member"
    };

    c.set("previewRole", roleByMode[previewMode.data]);
    c.set("previewMembershipStatus", previewMode.data === "member-inactive" ? "inactive" : "active");
  }

  const previewMembershipStatus = c.req.header("x-club-preview-membership");
  if (
    !previewMode.success &&
    isOwnerTelegramId(telegramUser.id) &&
    (previewMembershipStatus === "active" || previewMembershipStatus === "inactive")
  ) {
    c.set("previewMembershipStatus", previewMembershipStatus);
  }

  await next();
};
