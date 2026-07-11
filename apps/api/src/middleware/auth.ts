import type { MiddlewareHandler } from "hono";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import type { UserRole } from "@club/shared";
import { z } from "zod";
import { hasPwaStandaloneAuthHeader, hashAuthToken, pwaInstallRequiredMessage, pwaStandaloneAuthHeaderName } from "../auth/emailAuth";
import { db } from "../db/client";
import { authSessions, users, type User } from "../db/schema";
import { isOwnerTelegramId } from "../admin/roles";
import { logger } from "../logger";
import { getTrustedClientIp } from "../security/clientIp";
import { recordLoginIpChange } from "../security/loginIpAudit";

export const sessionCookieName = "club_session";

export type SessionUser = {
  id: string;
  firstName: string | null;
  username: string | null;
  photoUrl: string | null;
  startParam: string | null;
};

export type AuthVariables = {
  telegramUser: SessionUser;
  currentUser: User;
  userId: string;
  sessionTokenHash: string;
  previewRole: UserRole | null;
  previewMembershipStatus: "active" | "inactive" | null;
};

const previewModeSchema = z.enum(["developer", "admin", "member-active", "member-inactive"]);
type PreviewMode = z.infer<typeof previewModeSchema>;

export const sessionAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  if (!hasPwaStandaloneAuthHeader(c.req.header(pwaStandaloneAuthHeaderName))) {
    return c.json({ error: pwaInstallRequiredMessage }, 403);
  }

  const token = getCookie(c, sessionCookieName);
  if (!token) {
    return c.json({ error: "Email session is required" }, 401);
  }

  const tokenHash = hashAuthToken(token);
  const session = await db.query.authSessions.findFirst({
    where: and(eq(authSessions.tokenHash, tokenHash), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, new Date())),
    with: {
      user: true
    }
  });

  if (!session?.user) {
    return c.json({ error: "Invalid email session" }, 401);
  }

  await recordLoginIpChange({
    userId: session.user.id,
    sessionId: session.id,
    previousIpAddress: session.lastIpAddress,
    ipAddress: getTrustedClientIp(c.req.raw.headers)
  }).catch((error) => logger.warn({ error, userId: session.user.id }, "Unable to update login IP"));

  const resolvedUser = session.user;
  const sessionUser: SessionUser = {
    id: resolvedUser.telegramId,
    firstName: resolvedUser.firstName,
    username: resolvedUser.username,
    photoUrl: resolvedUser.photoUrl,
    startParam: null
  };

  await db.update(authSessions).set({ lastSeenAt: new Date() }).where(eq(authSessions.id, session.id));

  c.set("telegramUser", sessionUser);
  c.set("currentUser", resolvedUser);
  c.set("userId", resolvedUser.id);
  c.set("sessionTokenHash", tokenHash);
  c.set("previewRole", null);
  c.set("previewMembershipStatus", null);

  const previewMode = previewModeSchema.safeParse(c.req.header("x-club-preview-mode"));
  const isOwner = await isOwnerTelegramId(sessionUser.id);
  if (isOwner && previewMode.success) {
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
    isOwner &&
    (previewMembershipStatus === "active" || previewMembershipStatus === "inactive")
  ) {
    c.set("previewMembershipStatus", previewMembershipStatus);
  }

  await next();
};

export const telegramAuth = sessionAuth;
