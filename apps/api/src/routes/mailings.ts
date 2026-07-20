import { and, count, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { mailingChannelSchema, mailingFiltersSchema, type MailingChannel } from "@club/shared";
import { recordAdminAction } from "../admin/actionLog";
import { EmailDailyLimitError, getEmailDeliveryQuota, getRecentEmailDeliveryTimes, sendEmail } from "../auth/emailDelivery";
import { getUserRole, hasAdminPermission, isOwnerTelegramId } from "../admin/roles";
import { db } from "../db/client";
import { adminMailingRecipients, adminMailings, pushSubscriptions, userContentProgress, userMutes, users } from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import { getMembership } from "../membership/getMembership";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { createAppNotification } from "../notifications/create";
import { optimizeImageForUpload } from "../storage/imageOptimizer";
import { uploadObject } from "../storage/s3";
import { filterMailingAudience, type MailingAudienceUser } from "../mailings/audience";
import { getMailingDeliveryChannels, normalizeMailingChannel } from "../mailings/channels";
import { estimateMailingDurationSeconds, formatMailingDuration } from "../mailings/estimate";
import { planEmailDeliverySchedule } from "../mailings/emailPolicy";
import { getMailingRetryDecision, getStaleMailingProcessingCutoff } from "../mailings/deliveryReliability";
import { recalculateMailingDeliveryState } from "../mailings/deliveryState";
import { resolveMailingText, sanitizeMailingHtml } from "../mailings/html";
import {
  buildMailingAttachmentObjectKey,
  getMailingAttachmentKind,
  getMailingAttachmentUploadContentType
} from "../mailings/mediaUpload";
import { normalizeMailingFilters, serializeAdminMailing } from "../mailings/serialize";
import { createMailingUnsubscribeToken } from "../mailings/unsubscribe";
import { getObjectReadUrl } from "../storage/s3";

const mailingPreviewSchema = z.object({
  channel: mailingChannelSchema,
  filters: mailingFiltersSchema
});

const controlPayloadSchema = z.object({
  status: z.enum(["paused", "running", "stopped"])
});

function isAdminRole(role: string) {
  return role === "admin" || role === "owner";
}

function getFormString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getFormFile(form: FormData) {
  const value = form.get("attachment");
  return value instanceof File && value.size > 0 ? value : null;
}

function buildMailingText(mailing: { title: string; body: string }) {
  return mailing.title ? `${mailing.title}\n\n${mailing.body}` : mailing.body;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

async function sendMailingEmail({
  mailing,
  target,
  isTest = false
}: {
  mailing: Pick<typeof adminMailings.$inferSelect, "title" | "body" | "bodyHtml" | "attachmentObjectKey" | "attachmentFileName">;
  target: typeof users.$inferSelect;
  isTest?: boolean;
}) {
  if (!target.email?.trim() || target.marketingEmailOptOutAt) {
    return false;
  }

  const unsubscribeUrl = `${env.WEB_ORIGIN}/api/mailings/unsubscribe?token=${encodeURIComponent(createMailingUnsubscribeToken(target.id))}`;
  const attachmentUrl = mailing.attachmentObjectKey
    ? await getObjectReadUrl(mailing.attachmentObjectKey, "primary", { allowPublic: true })
    : null;
  const bodyHtml = sanitizeMailingHtml(mailing.bodyHtml || `<p>${escapeHtml(mailing.body).replace(/\n/g, "<br>")}</p>`);
  const attachmentHtml = attachmentUrl
    ? `<p><a href="${escapeHtml(attachmentUrl)}">Открыть вложение${mailing.attachmentFileName ? `: ${escapeHtml(mailing.attachmentFileName)}` : ""}</a></p>`
    : "";
  const html = `${bodyHtml}${attachmentHtml}<hr><p style="font-size:12px;color:#667085">Не хотите получать письма клуба? <a href="${escapeHtml(unsubscribeUrl)}">Отписаться</a>.</p>`;

  await sendEmail({
    to: target.email,
    subject: `${isTest ? "Тест: " : ""}${mailing.title}`,
    text: `${buildMailingText(mailing)}${attachmentUrl ? `\n\nВложение: ${attachmentUrl}` : ""}\n\nОтписаться: ${unsubscribeUrl}`,
    html,
    category: isTest ? "mailing_test" : "mailing",
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    }
  });
  return true;
}

async function rejectIfNotAdmin(c: Context<{ Variables: AuthVariables }>) {
  const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
  if (!isAdminRole(role)) {
    return c.json({ error: "Admin access required" }, 403);
  }

  if (!c.get("previewRole") && !(await isOwnerTelegramId(c.get("telegramUser").id)) && !(await hasAdminPermission(c.get("telegramUser").id, "mailings"))) {
    return c.json({ error: "Mailings permission required" }, 403);
  }

  return null;
}

async function uploadMailingAttachment(file: File) {
  const contentType = getMailingAttachmentUploadContentType(file.type || "application/octet-stream", file.name);
  if (!contentType) {
    return null;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const optimized = contentType.startsWith("image/")
    ? await optimizeImageForUpload({ bytes, contentType, fileName: file.name })
    : {
        body: bytes,
        contentType,
        fileName: file.name,
        sizeBytes: file.size
      };
  const key = buildMailingAttachmentObjectKey({
    fileName: optimized.fileName,
    id: randomUUID(),
    now: new Date()
  });
  const upload = await uploadObject({
    key,
    body: optimized.body,
    contentType: optimized.contentType
  });

  return {
    kind: getMailingAttachmentKind(optimized.contentType),
    fileName: optimized.fileName || "attachment",
    objectKey: upload.key,
    contentType: optimized.contentType,
    sizeBytes: optimized.sizeBytes
  };
}

type UploadedMailingAttachment = NonNullable<Awaited<ReturnType<typeof uploadMailingAttachment>>>;

function parseMailingFilters(value: string) {
  try {
    return mailingFiltersSchema.safeParse(JSON.parse(value || "{}"));
  } catch {
    return mailingFiltersSchema.safeParse(null);
  }
}

async function buildMailingAudienceUsers(): Promise<MailingAudienceUser[]> {
  const [allUsers, latestProgressRows, activeMutes] = await Promise.all([
    db.query.users.findMany(),
    db.query.userContentProgress.findMany({
      orderBy: [desc(userContentProgress.lastOpenedAt)]
    }),
    db.query.userMutes.findMany()
  ]);
  const lastProgressByUserId = new Map<string, Date>();
  for (const progress of latestProgressRows) {
    if (!lastProgressByUserId.has(progress.userId)) {
      lastProgressByUserId.set(progress.userId, progress.lastOpenedAt);
    }
  }
  const now = new Date();
  const activeMuteUserIds = new Set(
    activeMutes
      .filter((mute) => !mute.revokedAt && (!mute.expiresAt || mute.expiresAt > now))
      .map((mute) => mute.userId)
  );

  return Promise.all(
    allUsers.map(async (user) => {
      const [membership, role] = await Promise.all([getMembership(user.id), getUserRole(user.telegramId)]);

      return {
        id: user.id,
        telegramId: user.telegramId,
        email: user.email,
        marketingEmailOptOutAt: user.marketingEmailOptOutAt?.toISOString() ?? null,
        role,
        membershipStatus: membership.status,
        membershipExpiresAt: membership.subscription?.expiresAt?.toISOString() ?? null,
        tariff: membership.subscription?.provider ?? null,
        hasRestrictions: activeMuteUserIds.has(user.id),
        lastLoginAt: user.updatedAt.toISOString(),
        lastOpenedAt: lastProgressByUserId.get(user.id)?.toISOString() ?? null,
        telegramBotStatus: user.telegramBotStatus as MailingAudienceUser["telegramBotStatus"],
        createdAt: user.createdAt.toISOString()
      };
    })
  );
}

async function getAudiencePreview(channel: MailingChannel, filters: unknown) {
  const audienceUsers = await buildMailingAudienceUsers();
  const audience = filterMailingAudience(audienceUsers, normalizeMailingFilters(filters));
  const deliveryChannels = getMailingDeliveryChannels(channel);
  const hasPush = deliveryChannels.includes("push");
  const hasEmail = deliveryChannels.includes("email");
  const pushCount = hasPush ? audience.recipients.length : 0;
  const emailCount = hasEmail ? audience.emailRecipients.length : 0;
  const targetCount = hasPush ? audience.recipients.length : audience.emailRecipients.length;
  const recipientIds = audience.recipients.map((recipient) => recipient.id);
  const [subscriptionRow] = recipientIds.length
    ? await db
        .select({ value: count(pushSubscriptions.id) })
        .from(pushSubscriptions)
        .where(and(inArray(pushSubscriptions.userId, recipientIds), isNull(pushSubscriptions.revokedAt)))
    : [{ value: 0 }];
  const [recentEmailTimes, emailQuota] = await Promise.all([
    getRecentEmailDeliveryTimes(),
    getEmailDeliveryQuota()
  ]);
  const emailPlan = planEmailDeliverySchedule({ emailCount, existingDeliveryTimes: recentEmailTimes });
  const estimatedSeconds = estimateMailingDurationSeconds({ pushCount, emailCount: 0 }) + emailPlan.durationSeconds;

  return {
    audience,
    response: {
      targetCount,
      deliveryCount: pushCount + emailCount,
      pushCount,
      pushSubscriptionCount: hasPush ? Number(subscriptionRow?.value ?? 0) : 0,
      emailCount,
      excludedMissingEmail: hasEmail ? audience.excludedMissingEmail : 0,
      excludedEmailOptOut: hasEmail ? audience.excludedEmailOptOut : 0,
      excludedByFilters: audience.excludedByFilters,
      estimatedSeconds,
      estimatedLabel: formatMailingDuration(estimatedSeconds),
      emailQuota,
      emailCompletesAt: emailCount ? emailPlan.completesAt : null,
      emailDelayedByDailyLimit: emailPlan.delayedByDailyLimit
    }
  };
}

async function sendMailingToRecipient(
  mailing: typeof adminMailings.$inferSelect,
  recipient: typeof adminMailingRecipients.$inferSelect
) {
  const target = await db.query.users.findFirst({
    where: eq(users.id, recipient.userId)
  });
  if (!target) {
    await db
      .update(adminMailingRecipients)
      .set({ status: "skipped_missing_user", error: null, nextAttemptAt: null, updatedAt: new Date() })
      .where(eq(adminMailingRecipients.id, recipient.id));
    return "skipped" as const;
  }

  const attachment =
    mailing.attachmentKind &&
    mailing.attachmentFileName &&
    mailing.attachmentObjectKey &&
    mailing.attachmentContentType
      ? {
          kind: mailing.attachmentKind as "photo" | "video" | "document",
          fileName: mailing.attachmentFileName,
          objectKey: mailing.attachmentObjectKey,
          contentType: mailing.attachmentContentType,
          sizeBytes: mailing.attachmentSizeBytes ?? 0
        }
      : null;
  if (recipient.channel === "email") {
    const delivered = await sendMailingEmail({ mailing, target });
    if (!delivered) {
      await db
        .update(adminMailingRecipients)
        .set({ status: "skipped_email_unavailable", error: null, nextAttemptAt: null, updatedAt: new Date() })
        .where(eq(adminMailingRecipients.id, recipient.id));
      return "skipped" as const;
    }
  } else {
    await createAppNotification({
      userId: target.id,
      kind: "mailing",
      title: "Сообщение от клуба",
      body: buildMailingText(mailing),
      bodyHtml: mailing.bodyHtml,
      source: "mailing",
      sourceId: mailing.id,
      attachment
    });
  }

  await db
    .update(adminMailingRecipients)
    .set({ status: "sent", error: null, nextAttemptAt: null, sentAt: new Date(), updatedAt: new Date() })
    .where(eq(adminMailingRecipients.id, recipient.id));
  return "sent" as const;
}

async function sendDraftMailingTest({
  admin,
  title,
  body,
  bodyHtml,
  channel,
  attachment
}: {
  admin: typeof users.$inferSelect;
  title: string;
  body: string;
  bodyHtml: string | null;
  channel: MailingChannel;
  attachment: UploadedMailingAttachment | null;
}) {
  const mailing = { title, body, bodyHtml, attachmentObjectKey: attachment?.objectKey ?? null, attachmentFileName: attachment?.fileName ?? null };
  const deliveryChannels = getMailingDeliveryChannels(channel);

  if (deliveryChannels.includes("push")) {
    await createAppNotification({
      userId: admin.id,
      kind: "mailing",
      title: "Тест: Сообщение от клуба",
      body: buildMailingText(mailing),
      bodyHtml,
      source: "mailing_test",
      sourceId: null,
      attachment
    });
  }
  if (deliveryChannels.includes("email")) {
    const delivered = await sendMailingEmail({ mailing, target: admin, isTest: true });
    if (!delivered) {
      throw new Error("У вашего аккаунта нет доступного email для тестовой рассылки.");
    }
  }
}

export async function processMailingQueue(limit = 20) {
  const now = new Date();
  const runnableMailings = await db.query.adminMailings.findMany({
    where: and(
      inArray(adminMailings.status, ["scheduled", "running"]),
      lte(adminMailings.scheduledAt, now)
    ),
    orderBy: [desc(adminMailings.createdAt)],
    limit: 5
  });

  for (const mailing of runnableMailings) {
    if (mailing.status === "scheduled") {
      await db
        .update(adminMailings)
        .set({ status: "running", startedAt: mailing.startedAt ?? now, updatedAt: now })
        .where(eq(adminMailings.id, mailing.id));
    }

    const staleProcessingCutoff = getStaleMailingProcessingCutoff(now);
    await db
      .update(adminMailingRecipients)
      .set({ status: "pending", nextAttemptAt: null, updatedAt: now })
      .where(
        and(
          eq(adminMailingRecipients.mailingId, mailing.id),
          eq(adminMailingRecipients.status, "processing"),
          lt(adminMailingRecipients.updatedAt, staleProcessingCutoff)
        )
      );

    const recipients = await db.query.adminMailingRecipients.findMany({
      where: and(
        eq(adminMailingRecipients.mailingId, mailing.id),
        eq(adminMailingRecipients.status, "pending"),
        or(isNull(adminMailingRecipients.nextAttemptAt), lte(adminMailingRecipients.nextAttemptAt, now))
      ),
      orderBy: [desc(adminMailingRecipients.createdAt)],
      limit
    });

    let deferredUntil: Date | null = null;
    for (const recipient of recipients) {
      const [claimedRecipient] = await db
        .update(adminMailingRecipients)
        .set({
          status: "processing",
          attemptCount: sql`${adminMailingRecipients.attemptCount} + 1`,
          lastAttemptAt: now,
          updatedAt: now
        })
        .where(
          and(
            eq(adminMailingRecipients.id, recipient.id),
            eq(adminMailingRecipients.status, "pending"),
            or(isNull(adminMailingRecipients.nextAttemptAt), lte(adminMailingRecipients.nextAttemptAt, now))
          )
        )
        .returning({
          id: adminMailingRecipients.id,
          attemptCount: adminMailingRecipients.attemptCount
        });
      if (!claimedRecipient) {
        continue;
      }

      try {
        await sendMailingToRecipient(mailing, recipient);
      } catch (error) {
        if (error instanceof EmailDailyLimitError) {
          deferredUntil = error.retryAt;
          await db
            .update(adminMailingRecipients)
            .set({
              status: "pending",
              attemptCount: recipient.attemptCount,
              nextAttemptAt: null,
              lastAttemptAt: recipient.lastAttemptAt,
              error: null,
              updatedAt: new Date()
            })
            .where(eq(adminMailingRecipients.id, recipient.id));
          break;
        }
        const retryDecision = getMailingRetryDecision(claimedRecipient.attemptCount, error, new Date());
        await db
          .update(adminMailingRecipients)
          .set({
            status: retryDecision.status,
            nextAttemptAt: retryDecision.nextAttemptAt,
            error: retryDecision.error,
            updatedAt: new Date()
          })
          .where(eq(adminMailingRecipients.id, recipient.id));
        logger.warn({ error, mailingId: mailing.id, recipientId: recipient.id }, "Unable to send mailing recipient");
      }
    }

    await recalculateMailingDeliveryState(mailing.id, new Date(), deferredUntil);
  }
}

let mailingQueueTimer: ReturnType<typeof setInterval> | null = null;

export function startMailingDispatcher() {
  if (mailingQueueTimer) {
    return;
  }

  mailingQueueTimer = setInterval(() => {
    void processMailingQueue().catch((error) => {
      logger.error({ error }, "mailing queue processing failed");
    });
  }, 5000);
}

export const mailingsRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .use("*", async (c, next) => {
    const errorResponse = await rejectIfNotAdmin(c);
    if (errorResponse) {
      return errorResponse;
    }

    await next();
  })
  .get("/", async (c) => {
    const rows = await db.query.adminMailings.findMany({
      with: {
        createdBy: true
      },
      orderBy: [desc(adminMailings.createdAt)],
      limit: 100
    });

    return c.json({
      mailings: await Promise.all(rows.map(serializeAdminMailing)),
      emailQuota: await getEmailDeliveryQuota()
    });
  })
  .post("/preview", async (c) => {
    const body = mailingPreviewSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid mailing preview payload" }, 400);
    }

    const preview = await getAudiencePreview(body.data.channel, body.data.filters);
    return c.json(preview.response);
  })
  .post("/test-draft", async (c) => {
    const form = await c.req.formData().catch(() => null);
    if (!form) {
      return c.json({ error: "Invalid mailing test payload" }, 400);
    }

    const title = getFormString(form, "title");
    const bodyHtml = sanitizeMailingHtml(getFormString(form, "bodyHtml"));
    const body = resolveMailingText(getFormString(form, "body"), bodyHtml);
    const channelResult = mailingChannelSchema.safeParse(getFormString(form, "channel"));

    if (!title || !body || !channelResult.success) {
      return c.json({ error: "Заполните заголовок, сообщение и канал рассылки." }, 400);
    }

    const admin = await db.query.users.findFirst({
      where: eq(users.id, c.get("userId"))
    });
    if (!admin) {
      return c.json({ error: "Администратор не найден." }, 404);
    }

    const file = getFormFile(form);
    const upload = file ? await uploadMailingAttachment(file) : null;
    if (file && !upload) {
      return c.json({ error: "Файл не подходит для теста рассылки." }, 400);
    }

    await sendDraftMailingTest({
      admin,
      title,
      body,
      bodyHtml: bodyHtml || null,
      channel: channelResult.data,
      attachment: upload
    });

    await recordAdminAction(c, {
      action: "mailing.test_draft.sent",
      entityType: "mailing",
      entityId: null,
      summary: `Отправил тест черновика рассылки "${title}"`,
      metadata: {
        title,
        channel: channelResult.data,
        hasAttachment: Boolean(upload)
      }
    });

    return c.json({ ok: true });
  })
  .post("/", async (c) => {
    const form = await c.req.formData().catch(() => null);
    if (!form) {
      return c.json({ error: "Invalid mailing payload" }, 400);
    }

    const title = getFormString(form, "title");
    const bodyHtml = sanitizeMailingHtml(getFormString(form, "bodyHtml"));
    const body = resolveMailingText(getFormString(form, "body"), bodyHtml);
    const channelResult = mailingChannelSchema.safeParse(getFormString(form, "channel"));
    const filtersResult = parseMailingFilters(getFormString(form, "filters"));
    const scheduledAtValue = getFormString(form, "scheduledAt");
    const scheduledAt = scheduledAtValue ? new Date(scheduledAtValue) : new Date();

    if (!title || !body || !channelResult.success || !filtersResult.success || Number.isNaN(scheduledAt.getTime())) {
      return c.json({ error: "Заполните заголовок, сообщение, канал и фильтры рассылки." }, 400);
    }

    const file = getFormFile(form);
    const upload = file ? await uploadMailingAttachment(file) : null;
    if (file && !upload) {
      return c.json({ error: "Файл не подходит для рассылки." }, 400);
    }

    const preview = await getAudiencePreview(channelResult.data, filtersResult.data);
    const now = new Date();
    const [mailing] = await db
      .insert(adminMailings)
      .values({
        title,
        body,
        bodyHtml: bodyHtml || null,
        channel: channelResult.data,
        filters: filtersResult.data,
        status: scheduledAt > now ? "scheduled" : "running",
        scheduledAt,
        startedAt: scheduledAt > now ? null : now,
        createdByUserId: c.get("userId"),
        attachmentKind: upload?.kind ?? null,
        attachmentFileName: upload?.fileName ?? null,
        attachmentObjectKey: upload?.objectKey ?? null,
        attachmentContentType: upload?.contentType ?? null,
        attachmentSizeBytes: upload?.sizeBytes ?? null,
        estimatedSeconds: preview.response.estimatedSeconds,
        targetCount: preview.response.targetCount,
        deliveryCount: preview.response.deliveryCount,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    if (!mailing) {
      return c.json({ error: "Не удалось создать рассылку." }, 500);
    }

    const deliveryChannels = getMailingDeliveryChannels(channelResult.data);
    const deliveryRows = [
      ...(deliveryChannels.includes("push")
        ? preview.audience.recipients.map((recipient) => ({
          mailingId: mailing.id,
          userId: recipient.id,
          telegramId: recipient.telegramId,
          channel: "push",
          status: "pending"
        }))
        : []),
      ...(deliveryChannels.includes("email")
        ? preview.audience.emailRecipients.map((recipient) => ({
            mailingId: mailing.id,
            userId: recipient.id,
            telegramId: recipient.telegramId,
            channel: "email",
            status: "pending"
          }))
        : [])
    ];
    if (deliveryRows.length) {
      await db.insert(adminMailingRecipients).values(deliveryRows).onConflictDoNothing();
    }

    if (mailing.status === "running") {
      void processMailingQueue().catch((error) => {
        logger.error({ error, mailingId: mailing.id }, "Unable to start mailing immediately");
      });
    }

    await recordAdminAction(c, {
      action: mailing.status === "scheduled" ? "mailing.scheduled" : "mailing.created",
      entityType: "mailing",
      entityId: mailing.id,
      summary: mailing.status === "scheduled" ? `Запланировал рассылку "${mailing.title}"` : `Создал рассылку "${mailing.title}"`,
      metadata: {
        title: mailing.title,
        channel: mailing.channel,
        status: mailing.status,
        scheduledAt: mailing.scheduledAt?.toISOString() ?? null,
        targetCount: mailing.targetCount,
        deliveryCount: mailing.deliveryCount,
        estimatedSeconds: mailing.estimatedSeconds,
        hasAttachment: Boolean(mailing.attachmentObjectKey)
      }
    });

    return c.json({
      ok: true,
      mailing: await serializeAdminMailing(mailing)
    });
  })
  .post("/:id/retry-failed", async (c) => {
    const idResult = z.string().uuid().safeParse(c.req.param("id"));
    if (!idResult.success) {
      return c.json({ error: "Invalid mailing id" }, 400);
    }

    const mailing = await db.query.adminMailings.findFirst({
      where: eq(adminMailings.id, idResult.data)
    });
    if (!mailing) {
      return c.json({ error: "Рассылка не найдена." }, 404);
    }

    const now = new Date();
    const retryRows = await db
      .update(adminMailingRecipients)
      .set({
        status: "pending",
        attemptCount: 0,
        nextAttemptAt: null,
        lastAttemptAt: null,
        error: null,
        updatedAt: now
      })
      .where(
        and(
          eq(adminMailingRecipients.mailingId, mailing.id),
          eq(adminMailingRecipients.status, "failed")
        )
      )
      .returning({ id: adminMailingRecipients.id });

    if (retryRows.length === 0) {
      return c.json({ error: "В этой рассылке нет ошибочных доставок для повтора." }, 409);
    }

    await recalculateMailingDeliveryState(mailing.id, now);
    const refreshedMailing = await db.query.adminMailings.findFirst({
      where: eq(adminMailings.id, mailing.id)
    });
    if (!refreshedMailing) {
      return c.json({ error: "Не удалось обновить рассылку." }, 500);
    }

    await recordAdminAction(c, {
      action: "mailing.failed.retry",
      entityType: "mailing",
      entityId: mailing.id,
      summary: `Вернул ошибочные доставки рассылки "${mailing.title}" в очередь`,
      metadata: {
        title: mailing.title,
        retryCount: retryRows.length
      }
    });

    void processMailingQueue().catch((error) => {
      logger.error({ error, mailingId: mailing.id }, "Unable to retry failed mailing deliveries");
    });

    return c.json({
      ok: true,
      mailing: await serializeAdminMailing(refreshedMailing)
    });
  })
  .post("/:id/test", async (c) => {
    const idResult = z.string().uuid().safeParse(c.req.param("id"));
    if (!idResult.success) {
      return c.json({ error: "Invalid mailing id" }, 400);
    }

    const mailing = await db.query.adminMailings.findFirst({
      where: eq(adminMailings.id, idResult.data)
    });
    if (!mailing) {
      return c.json({ error: "Рассылка не найдена." }, 404);
    }

    const admin = await db.query.users.findFirst({
      where: eq(users.id, c.get("userId"))
    });
    if (!admin) {
      return c.json({ error: "Администратор не найден." }, 404);
    }

    await sendDraftMailingTest({
      admin,
      title: mailing.title,
      body: mailing.body,
      bodyHtml: mailing.bodyHtml,
      channel: normalizeMailingChannel(mailing.channel),
      attachment:
        mailing.attachmentKind && mailing.attachmentFileName && mailing.attachmentObjectKey && mailing.attachmentContentType
          ? {
              kind: mailing.attachmentKind as "photo" | "video" | "document",
              fileName: mailing.attachmentFileName,
              objectKey: mailing.attachmentObjectKey,
              contentType: mailing.attachmentContentType,
              sizeBytes: mailing.attachmentSizeBytes ?? 0
            }
          : null
    });

    await recordAdminAction(c, {
      action: "mailing.test.sent",
      entityType: "mailing",
      entityId: mailing.id,
      summary: `Отправил тест рассылки "${mailing.title}"`,
      metadata: {
        title: mailing.title,
        channel: mailing.channel
      }
    });

    return c.json({
      ok: true,
      mailing: await serializeAdminMailing(mailing)
    });
  })
  .post("/:id/pause", async (c) => updateMailingStatus(c, "paused"))
  .post("/:id/resume", async (c) => updateMailingStatus(c, "running"))
  .post("/:id/stop", async (c) => updateMailingStatus(c, "stopped"))
  .post("/:id/status", async (c) => {
    const body = controlPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid mailing status payload" }, 400);
    }

    return updateMailingStatus(c, body.data.status);
  });

async function updateMailingStatus(c: Context<{ Variables: AuthVariables }>, status: "paused" | "running" | "stopped") {
  const idResult = z.string().uuid().safeParse(c.req.param("id"));
  if (!idResult.success) {
    return c.json({ error: "Invalid mailing id" }, 400);
  }

  const current = await db.query.adminMailings.findFirst({
    where: eq(adminMailings.id, idResult.data)
  });
  if (!current) {
    return c.json({ error: "Рассылка не найдена." }, 404);
  }

  const now = new Date();
  const updates =
    status === "stopped"
      ? { status: "stopped", completedAt: now, updatedAt: now }
      : status === "paused"
        ? { status: "paused", updatedAt: now }
        : { status: "running", updatedAt: now };

  if (status === "stopped") {
    await db
      .update(adminMailingRecipients)
      .set({ status: "skipped_stopped", updatedAt: now })
      .where(and(eq(adminMailingRecipients.mailingId, current.id), eq(adminMailingRecipients.status, "pending")));
  }

  const [mailing] = await db
    .update(adminMailings)
    .set(updates)
    .where(eq(adminMailings.id, current.id))
    .returning();

  if (!mailing) {
    return c.json({ error: "Не удалось обновить рассылку." }, 500);
  }

  await recordAdminAction(c, {
    action: `mailing.${status}`,
    entityType: "mailing",
    entityId: mailing.id,
    summary:
      status === "paused"
        ? `Поставил рассылку "${mailing.title}" на паузу`
        : status === "running"
          ? `Продолжил рассылку "${mailing.title}"`
          : `Остановил рассылку "${mailing.title}"`,
    metadata: {
      title: mailing.title,
      status: mailing.status
    }
  });

  return c.json({
    ok: true,
    mailing: await serializeAdminMailing(mailing)
  });
}
