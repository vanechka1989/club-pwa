import { and, count, desc, eq, inArray, lte } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { mailingChannelSchema, mailingFiltersSchema } from "@club/shared";
import { getUserRole } from "../admin/roles";
import { db } from "../db/client";
import { adminMailingRecipients, adminMailings, userContentProgress, userMutes, users } from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import { getMembership } from "../membership/getMembership";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { createAppNotification } from "../notifications/create";
import { optimizeImageForUpload } from "../storage/imageOptimizer";
import { getObjectReadUrl, uploadObject } from "../storage/s3";
import { sendTelegramMedia, sendTelegramMessage } from "../telegram/client";
import { filterMailingAudience, type MailingAudienceUser } from "../mailings/audience";
import { estimateMailingDurationSeconds, formatMailingDuration } from "../mailings/estimate";
import {
  buildMailingAttachmentObjectKey,
  getMailingAttachmentKind,
  getMailingAttachmentUploadContentType
} from "../mailings/mediaUpload";
import { normalizeMailingFilters, serializeAdminMailing } from "../mailings/serialize";

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

function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function buildTelegramText(mailing: Pick<typeof adminMailings.$inferSelect, "title" | "body">) {
  return mailing.title ? `${mailing.title}\n\n${mailing.body}` : mailing.body;
}

async function rejectIfNotAdmin(c: Context<{ Variables: AuthVariables }>) {
  const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
  if (!isAdminRole(role)) {
    return c.json({ error: "Admin access required" }, 403);
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

async function getAudiencePreview(channel: "bot" | "app" | "all", filters: unknown) {
  const audienceUsers = await buildMailingAudienceUsers();
  const audience = filterMailingAudience(audienceUsers, normalizeMailingFilters(filters));
  const estimatedSeconds = estimateMailingDurationSeconds({
    recipientCount: audience.recipients.length,
    channel
  });

  return {
    audience,
    response: {
      targetCount: audience.recipients.length,
      excludedBotBlocked: audience.excludedBotBlocked,
      excludedByFilters: audience.excludedByFilters,
      estimatedSeconds,
      estimatedLabel: formatMailingDuration(estimatedSeconds)
    }
  };
}

async function sendMailingToRecipient(
  mailing: typeof adminMailings.$inferSelect,
  recipient: typeof adminMailingRecipients.$inferSelect,
  options: { sendApp?: boolean; sendBot?: boolean } = {}
) {
  const target = await db.query.users.findFirst({
    where: eq(users.id, recipient.userId)
  });
  if (!target || target.telegramBotStatus === "blocked") {
    await db
      .update(adminMailingRecipients)
      .set({ status: "skipped_bot_blocked", updatedAt: new Date() })
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
  const shouldSendApp = options.sendApp ?? (mailing.channel === "app" || mailing.channel === "all");
  const shouldSendBot = options.sendBot ?? (mailing.channel === "bot" || mailing.channel === "all");

  if (shouldSendApp) {
    await createAppNotification({
      userId: target.id,
      kind: "mailing",
      title: mailing.title || "Сообщение от клуба",
      body: mailing.body,
      bodyHtml: mailing.bodyHtml,
      source: "mailing",
      sourceId: mailing.id,
      attachment
    });
  }

  if (shouldSendBot) {
    const replyMarkup = {
      inline_keyboard: [[{ text: "Открыть клуб", web_app: { url: env.WEB_ORIGIN } }]]
    };
    if (attachment) {
      await sendTelegramMedia({
        chatId: recipient.telegramId,
        kind: attachment.kind,
        url: await getObjectReadUrl(attachment.objectKey),
        caption: buildTelegramText(mailing).slice(0, 1024),
        replyMarkup
      });
    } else {
      await sendTelegramMessage({
        chatId: recipient.telegramId,
        text: buildTelegramText(mailing),
        replyMarkup
      });
    }
  }

  await db
    .update(adminMailingRecipients)
    .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
    .where(eq(adminMailingRecipients.id, recipient.id));
  return "sent" as const;
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
        .set({ status: "running", startedAt: now, updatedAt: now })
        .where(eq(adminMailings.id, mailing.id));
    }

    const recipients = await db.query.adminMailingRecipients.findMany({
      where: and(eq(adminMailingRecipients.mailingId, mailing.id), eq(adminMailingRecipients.status, "pending")),
      orderBy: [desc(adminMailingRecipients.createdAt)],
      limit
    });

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const recipient of recipients) {
      try {
        const result = await sendMailingToRecipient(mailing, recipient);
        if (result === "sent") {
          sent += 1;
        } else {
          skipped += 1;
        }
      } catch (error) {
        failed += 1;
        await db
          .update(adminMailingRecipients)
          .set({
            status: "failed",
            error: error instanceof Error ? error.message : "Unable to send mailing",
            updatedAt: new Date()
          })
          .where(eq(adminMailingRecipients.id, recipient.id));
        logger.warn({ error, mailingId: mailing.id, recipientId: recipient.id }, "Unable to send mailing recipient");
      }
    }

    const [pendingRow] = await db
      .select({ value: count(adminMailingRecipients.id) })
      .from(adminMailingRecipients)
      .where(and(eq(adminMailingRecipients.mailingId, mailing.id), eq(adminMailingRecipients.status, "pending")));
    const [current] = await db
      .select()
      .from(adminMailings)
      .where(eq(adminMailings.id, mailing.id));

    if (current) {
      await db
        .update(adminMailings)
        .set({
          sentCount: current.sentCount + sent,
          failedCount: current.failedCount + failed,
          skippedCount: current.skippedCount + skipped,
          status: pendingRow?.value ? "running" : "completed",
          completedAt: pendingRow?.value ? current.completedAt : new Date(),
          updatedAt: new Date()
        })
        .where(eq(adminMailings.id, mailing.id));
    }
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
      orderBy: [desc(adminMailings.createdAt)],
      limit: 100
    });

    return c.json({
      mailings: await Promise.all(rows.map(serializeAdminMailing))
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
  .post("/", async (c) => {
    const form = await c.req.formData().catch(() => null);
    if (!form) {
      return c.json({ error: "Invalid mailing payload" }, 400);
    }

    const title = getFormString(form, "title");
    const bodyHtml = getFormString(form, "bodyHtml");
    const body = getFormString(form, "body") || htmlToText(bodyHtml);
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
        createdAt: now,
        updatedAt: now
      })
      .returning();

    if (!mailing) {
      return c.json({ error: "Не удалось создать рассылку." }, 500);
    }

    if (preview.audience.recipients.length) {
      await db.insert(adminMailingRecipients).values(
        preview.audience.recipients.map((recipient) => ({
          mailingId: mailing.id,
          userId: recipient.id,
          telegramId: recipient.telegramId,
          status: "pending"
        }))
      );
    }

    if (mailing.status === "running") {
      void processMailingQueue().catch((error) => {
        logger.error({ error, mailingId: mailing.id }, "Unable to start mailing immediately");
      });
    }

    return c.json({
      ok: true,
      mailing: await serializeAdminMailing(mailing)
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

    const fakeRecipient = {
      id: randomUUID(),
      mailingId: mailing.id,
      userId: admin.id,
      telegramId: admin.telegramId,
      status: "pending",
      error: null,
      sentAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } satisfies typeof adminMailingRecipients.$inferSelect;

    if (mailing.channel === "bot" || mailing.channel === "all") {
      if (admin.telegramBotStatus === "blocked") {
        return c.json({ error: "Вы заблокировали бота, тест в Telegram не уйдет." }, 400);
      }
    }

    if (mailing.channel === "app" || mailing.channel === "all") {
      await createAppNotification({
        userId: admin.id,
        kind: "mailing",
        title: `Тест: ${mailing.title}`,
        body: mailing.body,
        bodyHtml: mailing.bodyHtml,
        source: "mailing",
        sourceId: mailing.id,
        attachment:
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
            : null
      });
    }

    if (mailing.channel === "bot" || mailing.channel === "all") {
      await sendMailingToRecipient(mailing, fakeRecipient, { sendApp: false, sendBot: true });
    }

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

  return c.json({
    ok: true,
    mailing: await serializeAdminMailing(mailing)
  });
}
