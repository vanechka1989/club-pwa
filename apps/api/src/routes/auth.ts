import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { z } from "zod";
import {
  buildEmailLoginMessage,
  createLoginCode,
  getEmailLoginCodeCooldownSeconds,
  hasPwaStandaloneAuthHeader,
  hashAuthToken,
  normalizeEmail,
  pwaInstallRequiredMessage,
  pwaStandaloneAuthHeaderName
} from "../auth/emailAuth";
import {
  clearEmailDeviceLoginAttempts,
  getEmailLoginAttemptContext,
  recordFailedEmailLoginAttempt,
  type LoginAttemptStatus
} from "../auth/emailLoginAttempts";
import { EmailDailyLimitError, sendEmail } from "../auth/emailDelivery";
import { recordEmailCodeRequest } from "../auth/emailCodeRequests";
import { db } from "../db/client";
import { authEmailLoginCodes, authSessions, users } from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import { sessionCookieName } from "../middleware/auth";
import { captureReferralFromStartParam } from "../referrals/referrals";
import { getTrustedClientIp } from "../security/clientIp";
import { recordLoginIpChange } from "../security/loginIpAudit";

const startSchema = z.object({
  email: z.string(),
  referralCode: z.string().trim().max(64).optional().nullable()
});

const verifySchema = z.object({
  email: z.string(),
  code: z.string().trim().regex(/^\d{6}$/),
  referralCode: z.string().trim().max(64).optional().nullable()
});

const loginAttemptDeviceCookieName = "club_login_device";

function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Lax" as const,
    path: "/",
    expires: expiresAt
  };
}

function getOrCreateLoginAttemptDevice(c: Parameters<typeof getCookie>[0]) {
  const existing = getCookie(c, loginAttemptDeviceCookieName);
  if (existing && /^[A-Za-z0-9_-]{32,128}$/.test(existing)) return existing;

  const token = randomBytes(24).toString("base64url");
  setCookie(c, loginAttemptDeviceCookieName, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60
  });
  return token;
}

function formatRetryDelay(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes >= 60 ? "1 час" : `${minutes} мин.`;
}

function tooManyAttemptsPayload(status: LoginAttemptStatus) {
  return {
    code: "AUTH_TOO_MANY_ATTEMPTS",
    error: `Слишком много неверных попыток. Попробуйте снова через ${formatRetryDelay(status.retryAfterSeconds)}.`,
    attemptsRemaining: 0,
    retryAfterSeconds: status.retryAfterSeconds
  };
}

async function findOrCreateEmailUser(email: string) {
  const existing = await db.query.users.findFirst({
    where: or(eq(users.email, email), eq(users.telegramId, email))
  });
  const now = new Date();
  const displayName = email.split("@")[0] || "Участник";

  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        telegramId: email,
        email,
        emailVerifiedAt: now,
        firstName: existing.firstName ?? displayName,
        username: email,
        updatedAt: now
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await db
    .insert(users)
    .values({
      telegramId: email,
      email,
      emailVerifiedAt: now,
      firstName: displayName,
      username: email,
      photoUrl: null
    })
    .returning();

  return created ?? null;
}

export const authRoute = new Hono()
  .post("/email/start", async (c) => {
    if (!hasPwaStandaloneAuthHeader(c.req.header(pwaStandaloneAuthHeaderName))) {
      return c.json({ error: pwaInstallRequiredMessage }, 403);
    }

    const body = startSchema.safeParse(await c.req.json().catch(() => null));
    const email = body.success ? normalizeEmail(body.data.email) : null;
    if (!email) {
      return c.json({ error: "Введите корректный email." }, 400);
    }
    const loginAttemptDevice = getOrCreateLoginAttemptDevice(c);

    const latestLoginCode = await db.query.authEmailLoginCodes.findFirst({
      where: eq(authEmailLoginCodes.email, email),
      orderBy: [desc(authEmailLoginCodes.createdAt)]
    });
    const retryAfterSeconds = getEmailLoginCodeCooldownSeconds(latestLoginCode?.createdAt);
    if (retryAfterSeconds > 0) {
      return c.json({ error: `Повторный код можно получить через ${retryAfterSeconds}с.`, retryAfterSeconds }, 429);
    }

    const requestLimits = await recordEmailCodeRequest({
      email,
      deviceToken: loginAttemptDevice,
      ipAddress: getTrustedClientIp(c.req.raw.headers)
    });
    const blockedRequest = [requestLimits.email, requestLimits.device, requestLimits.ip]
      .filter((value): value is LoginAttemptStatus => Boolean(value?.blocked))
      .sort((left, right) => right.retryAfterSeconds - left.retryAfterSeconds)[0];
    if (blockedRequest) {
      return c.json(
        {
          code: "AUTH_CODE_RATE_LIMIT",
          error: `Слишком много запросов кода. Попробуйте снова через ${formatRetryDelay(blockedRequest.retryAfterSeconds)}.`,
          retryAfterSeconds: blockedRequest.retryAfterSeconds
        },
        429
      );
    }

    const code = createLoginCode();
    const expiresAt = new Date(Date.now() + env.AUTH_LOGIN_CODE_TTL_MINUTES * 60 * 1000);
    await db.insert(authEmailLoginCodes).values({
      email,
      codeHash: hashAuthToken(`${email}:${code}`),
      expiresAt
    });

    const message = buildEmailLoginMessage({
      code,
      expiresInMinutes: env.AUTH_LOGIN_CODE_TTL_MINUTES,
      webOrigin: env.WEB_ORIGIN
    });
    try {
      await sendEmail({ to: email, ...message, category: "auth" });
    } catch (error) {
      await db.delete(authEmailLoginCodes).where(and(
        eq(authEmailLoginCodes.email, email),
        eq(authEmailLoginCodes.codeHash, hashAuthToken(`${email}:${code}`)),
        isNull(authEmailLoginCodes.consumedAt)
      ));
      if (error instanceof EmailDailyLimitError) {
        return c.json({
          error: "Суточный лимит отправки писем временно исчерпан. Попробуйте позже.",
          retryAt: error.retryAt.toISOString()
        }, 429);
      }
      throw error;
    }

    return c.json({
      ok: true,
      devCode: env.NODE_ENV !== "production" && env.AUTH_DEV_CODE_ENABLED ? code : null
    });
  })
  .post("/email/verify", async (c) => {
    if (!hasPwaStandaloneAuthHeader(c.req.header(pwaStandaloneAuthHeaderName))) {
      return c.json({ error: pwaInstallRequiredMessage }, 403);
    }

    const body = verifySchema.safeParse(await c.req.json().catch(() => null));
    const email = body.success ? normalizeEmail(body.data.email) : null;
    if (!body.success || !email) {
      return c.json({ error: "Введите email и код из письма." }, 400);
    }

    const now = new Date();
    const attemptContext = await getEmailLoginAttemptContext({
      email,
      deviceToken: getOrCreateLoginAttemptDevice(c),
      ipAddress: getTrustedClientIp(c.req.raw.headers),
      now
    });
    const activeBlock = attemptContext.emailDevice.blocked
      ? attemptContext.emailDevice
      : attemptContext.ip?.blocked
        ? attemptContext.ip
        : null;
    if (activeBlock) {
      return c.json(tooManyAttemptsPayload(activeBlock), 429);
    }

    const activeCode = await db.query.authEmailLoginCodes.findFirst({
      where: and(
        eq(authEmailLoginCodes.email, email),
        isNull(authEmailLoginCodes.consumedAt),
        gt(authEmailLoginCodes.expiresAt, now)
      ),
      orderBy: [desc(authEmailLoginCodes.createdAt)]
    });
    if (!activeCode) {
      return c.json(
        { code: "AUTH_CODE_EXPIRED", error: "Код уже истёк. Запросите новый код.", attemptsRemaining: attemptContext.emailDevice.attemptsRemaining },
        400
      );
    }

    const codeHash = hashAuthToken(`${email}:${body.data.code}`);
    const [loginCode] = await db
      .update(authEmailLoginCodes)
      .set({ consumedAt: now })
      .where(
        and(
          eq(authEmailLoginCodes.email, email),
          eq(authEmailLoginCodes.codeHash, codeHash),
          isNull(authEmailLoginCodes.consumedAt),
          gt(authEmailLoginCodes.expiresAt, now)
        )
      )
      .returning({ id: authEmailLoginCodes.id });

    if (!loginCode) {
      const failedAttempt = await recordFailedEmailLoginAttempt(attemptContext, now);
      const reachedLimit = failedAttempt.emailDevice.blocked
        ? failedAttempt.emailDevice
        : failedAttempt.ip?.blocked
          ? failedAttempt.ip
          : null;
      if (reachedLimit) {
        return c.json(tooManyAttemptsPayload(reachedLimit), 429);
      }

      return c.json(
        {
          code: "AUTH_INVALID_CODE",
          error: `Неверный код. Проверьте цифры и попробуйте ещё раз. Осталось попыток: ${failedAttempt.emailDevice.attemptsRemaining}.`,
          attemptsRemaining: failedAttempt.emailDevice.attemptsRemaining
        },
        400
      );
    }

    await clearEmailDeviceLoginAttempts(attemptContext.emailDeviceKey);

    const user = await findOrCreateEmailUser(email);
    if (!user) {
      return c.json({ error: "Не удалось создать пользователя." }, 500);
    }
    if (body.data.referralCode) {
      await captureReferralFromStartParam(user, `ref_${body.data.referralCode}`).catch(() => null);
    }

    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + env.AUTH_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const [session] = await db
      .insert(authSessions)
      .values({
        userId: user.id,
        tokenHash: hashAuthToken(token),
        expiresAt
      })
      .returning({ id: authSessions.id });
    if (!session) return c.json({ error: "Не удалось создать сессию." }, 500);

    await recordLoginIpChange({
      userId: user.id,
      sessionId: session.id,
      previousIpAddress: null,
      ipAddress: getTrustedClientIp(c.req.raw.headers),
      now
    }).catch((error) => logger.warn({ error, userId: user.id }, "Unable to record login IP"));
    setCookie(c, sessionCookieName, token, sessionCookieOptions(expiresAt));

    return c.json({ ok: true });
  })
  .post("/logout", async (c) => {
    const token = getCookie(c, sessionCookieName);
    if (token) {
      await db
        .update(authSessions)
        .set({ revokedAt: new Date() })
        .where(eq(authSessions.tokenHash, hashAuthToken(token)));
    }

    deleteCookie(c, sessionCookieName, { path: "/" });
    return c.json({ ok: true });
  });
