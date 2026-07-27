import { and, asc, desc, eq, inArray, isNotNull, lte, ne } from "drizzle-orm";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import { supportUploadedObjectSchema, supportUploadedObjectsSchema, supportUploadIntentSchema, type SupportUploadedObject } from "@club/shared";
import { recordAdminAction } from "../admin/actionLog";
import { getOwnerTelegramId, getUserRole, hasAdminPermission, isOwnerTelegramId } from "../admin/roles";
import { db } from "../db/client";
import { supportTicketAttachments, supportTicketMessages, supportTickets, users } from "../db/schema";
import { logger } from "../logger";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { persistentWriteRateLimit } from "../security/persistentWriteRateLimit";
import { createAppNotification } from "../notifications/create";
import { deleteObject, getObjectMetadata, getObjectReadUrl, listObjects, mirrorObjectToReserve, uploadObjectStream } from "../storage/s3";
import {
  getSupportAttachmentExpiresAt
} from "../support/mediaUpload";
import { createSupportUploadIntent, isSupportPendingObjectExpired, validateSupportUploadStreamRequest, verifySupportUploadedObjects } from "../support/directUpload";
import { selectSupportAdminTelegramIds } from "../support/adminNotificationRecipients";
import { getSupportUnreadCount } from "../support/unreadCount";

const supportTopics = [
  {
    id: "payment",
    title: "Оплата",
    description: "Платежи, подписки, чеки и списания."
  },
  {
    id: "access",
    title: "Доступ",
    description: "Не открываются разделы, уроки или материалы."
  },
  {
    id: "media",
    title: "Обучение",
    description: "Уроки, модули, загрузка или воспроизведение."
  },
  {
    id: "other",
    title: "Другая причина",
    description: "Если подходящей причины нет в списке."
  }
];

const customerTicketStatusLabel: Record<string, string> = {
  open: "Ожидает ответа",
  answered: "Ответ получен",
  closed: "Закрыто"
};

const adminTicketStatusLabel: Record<string, string> = {
  open: "Нужно ответить",
  answered: "Ответ отправлен",
  closed: "Закрыто"
};

const ticketTopicSchema = z.enum(["payment", "access", "media", "other"]);
const supportTicketCreateSchema = z.object({
  topic: ticketTopicSchema,
  customTopic: z.string().trim().max(200).default(""),
  message: z.string().trim().min(1).max(10_000),
  attachments: supportUploadedObjectsSchema.default([])
});
const supportMessageCreateSchema = z.object({
  message: z.string().trim().max(10_000).default(""),
  attachments: supportUploadedObjectsSchema.default([])
});

function isAdminRole(role: string) {
  return role === "admin" || role === "owner";
}

async function canUseSupportAdmin(c: { get: <T extends keyof AuthVariables>(key: T) => AuthVariables[T] }, role: string) {
  if (!isAdminRole(role)) {
    return false;
  }

  if (c.get("previewRole")) {
    return true;
  }

  const telegramId = c.get("telegramUser").id;
  return (await isOwnerTelegramId(telegramId)) || (await hasAdminPermission(telegramId, "support"));
}

function dateToIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function isAfter(left: Date | null | undefined, right: Date | null | undefined) {
  return Boolean(left && (!right || left.getTime() > right.getTime()));
}

async function readSupportAttachments(userId: string, uploaded: SupportUploadedObject[]) {
  return verifySupportUploadedObjects({
    uploaded,
    userId,
    getMetadata: getObjectMetadata,
    isConsumed: async (objectKey) => Boolean(await db.query.supportTicketAttachments.findFirst({
      where: eq(supportTicketAttachments.objectKey, objectKey),
      columns: { id: true }
    }))
  });
}

async function persistSupportAttachments({
  ticketId,
  messageId,
  attachments,
  now
}: {
  ticketId: string;
  messageId: string;
  attachments: Awaited<ReturnType<typeof readSupportAttachments>>;
  now: Date;
}) {
  if (!attachments.length) return;
  await db.insert(supportTicketAttachments).values(attachments.map((attachment) => ({
    ticketId,
    messageId,
    kind: attachment.kind,
    fileName: attachment.fileName,
    objectKey: attachment.objectKey,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
    expiresAt: getSupportAttachmentExpiresAt(now),
    createdAt: now
  })));
}

async function serializeAttachment(attachment: typeof supportTicketAttachments.$inferSelect) {
  return {
    id: attachment.id,
    kind: attachment.kind as "photo" | "video",
    fileName: attachment.fileName,
    url: await getObjectReadUrl(attachment.objectKey),
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt.toISOString()
  };
}

async function serializeTicket(
  ticket: NonNullable<Awaited<ReturnType<typeof getTicketById>>>,
  viewerRole: string,
  canSeeAdminAuthors: boolean
) {
  const topic = supportTopics.find((item) => item.id === ticket.topic);
  const messages = await Promise.all(
    ticket.messages.map(async (message) => ({
      id: message.id,
      authorRole: message.authorRole as "customer" | "admin",
      body: message.body,
      author:
        message.authorRole === "admin" && !canSeeAdminAuthors
          ? {
              telegramId: "support",
              firstName: null,
              username: null,
              photoUrl: null
            }
          : {
              telegramId: message.author.telegramId,
              firstName: message.author.firstName,
              username: message.author.username,
              photoUrl: message.author.photoUrl
            },
      attachments: await Promise.all(message.attachments.map(serializeAttachment)),
      createdAt: message.createdAt.toISOString()
    }))
  );

  return {
    id: ticket.id,
    topic: ticket.topic,
    topicTitle: ticket.customTopic || topic?.title || ticket.topic,
    customTopic: ticket.customTopic,
    message: ticket.message,
    status: ticket.status,
    statusLabel: (isAdminRole(viewerRole) ? adminTicketStatusLabel : customerTicketStatusLabel)[ticket.status] ?? ticket.status,
    waitingSince: ticket.status === "open" ? ticket.lastCustomerMessageAt.toISOString() : null,
    customer: {
      telegramId: ticket.user.telegramId,
      firstName: ticket.user.firstName,
      username: ticket.user.username,
      photoUrl: ticket.user.photoUrl
    },
    closedAt: dateToIso(ticket.closedAt),
    closedBy: ticket.closedBy
      ? {
          telegramId: ticket.closedBy.telegramId,
          firstName: ticket.closedBy.firstName,
          username: ticket.closedBy.username,
          photoUrl: ticket.closedBy.photoUrl
        }
      : null,
    messages,
    unread:
      isAdminRole(viewerRole)
        ? isAfter(ticket.lastCustomerMessageAt, ticket.adminReadAt)
        : isAfter(ticket.lastAdminMessageAt, ticket.customerReadAt),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString()
  };
}

async function getTicketById(id: string) {
  return db.query.supportTickets.findFirst({
    where: eq(supportTickets.id, id),
    with: {
      user: true,
      closedBy: true,
      messages: {
        orderBy: [asc(supportTicketMessages.createdAt)],
        with: {
          author: true,
          attachments: true
        }
      }
    }
  });
}

async function cleanupExpiredSupportAttachments(now = new Date()) {
  const attachments = await db.query.supportTicketAttachments.findMany({
    where: and(isNotNull(supportTicketAttachments.expiresAt), lte(supportTicketAttachments.expiresAt, now)),
    limit: 100
  });

  for (const attachment of attachments) {
    await deleteObject(attachment.objectKey).catch((error) => {
      logger.warn({ error, attachmentId: attachment.id }, "Unable to delete expired support attachment object");
    });
    await db.delete(supportTicketAttachments).where(eq(supportTicketAttachments.id, attachment.id));
  }

  void cleanupAbandonedSupportUploads(now).catch((error) => {
    logger.warn({ error }, "Unable to clean abandoned support uploads");
  });
}

let pendingUploadCleanupStartedAt = 0;
let pendingUploadCleanup: Promise<void> | null = null;

async function cleanupAbandonedSupportUploads(now: Date) {
  if (now.getTime() - pendingUploadCleanupStartedAt < 60 * 60 * 1000) return;
  if (pendingUploadCleanup) return pendingUploadCleanup;
  pendingUploadCleanupStartedAt = now.getTime();
  pendingUploadCleanup = (async () => {
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const listed = await listObjects({ prefix: "support/pending/", cursor, limit: 100 });
      const candidates = listed.objects.filter((object) => isSupportPendingObjectExpired(object, now));
      if (candidates.length) {
        const keys = candidates.map((object) => object.key);
        const referenced = await db
          .select({ objectKey: supportTicketAttachments.objectKey })
          .from(supportTicketAttachments)
          .where(inArray(supportTicketAttachments.objectKey, keys));
        const referencedKeys = new Set(referenced.map((item) => item.objectKey));
        await Promise.all(keys.filter((key) => !referencedKeys.has(key)).map((key) => deleteObject(key)));
      }
      cursor = listed.nextCursor;
      if (!cursor) break;
    }
  })().finally(() => {
    pendingUploadCleanup = null;
  });
  return pendingUploadCleanup;
}

async function notifyCustomerAboutReply(ticket: NonNullable<Awaited<ReturnType<typeof getTicketById>>>) {
  const latestAdminMessage = ticket.messages
    .filter((message) => message.authorRole === "admin")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  await createAppNotification({
    userId: ticket.userId,
    kind: "support",
    title: "Ответ поддержки",
    body: latestAdminMessage?.body ?? "Вам ответили в поддержке.",
    source: "support",
    sourceId: ticket.id
  }).catch((error) => {
    logger.warn({ error, ticketId: ticket.id }, "Unable to create support app notification");
  });

}

async function notifyAdminsAboutCustomerMessage(ticket: NonNullable<Awaited<ReturnType<typeof getTicketById>>>) {
  const ownerTelegramId = await getOwnerTelegramId();
  const admins = await db.query.adminUsers.findMany();
  const telegramIds = selectSupportAdminTelegramIds({ ownerTelegramId, admins });
  const adminProfiles = telegramIds.length
    ? await db.query.users.findMany({
        where: inArray(users.telegramId, telegramIds)
      })
    : [];
  const latestCustomerMessage = ticket.messages
    .filter((message) => message.authorRole === "customer")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
  const customerTitle = ticket.user.firstName || (ticket.user.username ? `@${ticket.user.username}` : `ID ${ticket.user.telegramId}`);

  await Promise.all(
    adminProfiles.map((admin) =>
      createAppNotification({
        userId: admin.id,
        kind: "support",
        title: `Поддержка: ${ticket.customTopic || supportTopics.find((topic) => topic.id === ticket.topic)?.title || ticket.topic}`,
        body: `${customerTitle}: ${latestCustomerMessage?.body ?? ticket.message}`,
        source: "support",
        sourceId: ticket.id
      }).catch((error) => {
        logger.warn({ error, ticketId: ticket.id, adminUserId: admin.id }, "Unable to create admin support notification");
      })
    )
  );
}

export const supportRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .use("*", persistentWriteRateLimit)
  .get("/", async (c) => {
    await cleanupExpiredSupportAttachments();
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    const isSupportAdmin = await canUseSupportAdmin(c, role);

    const tickets = await db.query.supportTickets.findMany({
      where: eq(supportTickets.userId, userId),
      orderBy: [desc(supportTickets.updatedAt)],
      limit: 100,
      with: {
        user: true,
        closedBy: true,
        messages: {
          orderBy: [asc(supportTicketMessages.createdAt)],
          limit: 200,
          with: {
            author: true,
            attachments: true
          }
        }
      }
    });

    return c.json({
      managerContact: null,
      topics: supportTopics,
      tickets: await Promise.all(tickets.map((ticket) => serializeTicket(ticket, role, isSupportAdmin))),
      unreadCount: await getSupportUnreadCount({ userId, isSupportAdmin })
    });
  })
  .get("/unread", async (c) => {
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    const isSupportAdmin = await canUseSupportAdmin(c, role);

    return c.json({
      unreadCount: await getSupportUnreadCount({ userId, isSupportAdmin })
    });
  })
  .post("/uploads", async (c) => {
    const body = supportUploadIntentSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Файл не подходит. Максимальный размер — 50 МБ." }, 413);
    }

    try {
      return c.json(createSupportUploadIntent({
        userId: c.get("userId"),
        input: body.data,
        uploadToken: randomUUID()
      }));
    } catch (error) {
      logger.warn({ error, userId: c.get("userId") }, "Unable to create support upload intent");
      return c.json({ error: "Не удалось подготовить загрузку файла." }, 503);
    }
  })
  .put("/uploads/:uploadToken", async (c) => {
    const uploaded = supportUploadedObjectSchema.safeParse({
      uploadToken: c.req.param("uploadToken"),
      objectKey: c.req.query("objectKey"),
      fileName: c.req.query("fileName"),
      contentType: c.req.query("contentType"),
      sizeBytes: Number(c.req.query("sizeBytes"))
    });
    const expiresAt = z.coerce.date().safeParse(c.req.query("expiresAt"));
    if (!uploaded.success || !expiresAt.success) {
      return c.json({ error: "Некорректные параметры загрузки." }, 400);
    }

    const rawLength = Number(c.req.header("content-length"));
    const validation = validateSupportUploadStreamRequest({
      uploaded: uploaded.data,
      userId: c.get("userId"),
      contentLength: Number.isSafeInteger(rawLength) ? rawLength : null,
      contentType: c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "",
      hasBody: Boolean(c.req.raw.body),
      expiresAt: expiresAt.data
    });
    if (!validation.ok) {
      const status = validation.error === "content_length_mismatch" ? 413 : 400;
      return c.json({ error: "Файл не прошёл проверку загрузки." }, status);
    }

    try {
      const body = Readable.fromWeb(c.req.raw.body as never);
      await uploadObjectStream({
        key: uploaded.data.objectKey,
        body,
        contentType: uploaded.data.contentType,
        sizeBytes: uploaded.data.sizeBytes
      });
      void mirrorObjectToReserve(uploaded.data.objectKey, uploaded.data.contentType).catch((error) => {
        logger.warn({ error, objectKey: uploaded.data.objectKey }, "Unable to mirror support upload to reserve S3");
      });
      return c.json({ ok: true });
    } catch (error) {
      logger.warn({ error, userId: c.get("userId"), objectKey: uploaded.data.objectKey }, "Unable to stream support upload to S3");
      return c.json({ error: "Хранилище временно не приняло файл." }, 503);
    }
  })
  .post("/tickets", async (c) => {
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    const isSupportAdmin = await canUseSupportAdmin(c, role);
    const body = supportTicketCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Заполните причину обращения и сообщение." }, 400);
    }
    const { topic, message, customTopic } = body.data;

    if (topic === "other" && !customTopic) {
      return c.json({ error: "Напишите свою причину обращения." }, 400);
    }

    let attachments: Awaited<ReturnType<typeof readSupportAttachments>>;
    try {
      attachments = await readSupportAttachments(userId, body.data.attachments);
    } catch (error) {
      logger.warn({ error, userId }, "Unable to verify support attachments");
      return c.json({ error: "Не удалось проверить загруженный файл. Загрузите его повторно." }, 400);
    }
    const now = new Date();
    const [ticket] = await db
      .insert(supportTickets)
      .values({
        userId,
        topic,
        customTopic: topic === "other" ? customTopic : null,
        message,
        status: "open",
        lastCustomerMessageAt: now,
        customerReadAt: now,
        updatedAt: now
      })
      .returning();

    if (!ticket) {
      return c.json({ error: "Не удалось создать обращение." }, 500);
    }

    const [ticketMessage] = await db
      .insert(supportTicketMessages)
      .values({
        ticketId: ticket.id,
        authorUserId: userId,
        authorRole: "customer",
        body: message,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    if (!ticketMessage) {
      return c.json({ error: "Не удалось создать сообщение обращения." }, 500);
    }

    await persistSupportAttachments({ ticketId: ticket.id, messageId: ticketMessage.id, attachments, now });

    const createdTicket = await getTicketById(ticket.id);
    if (!createdTicket) {
      return c.json({ error: "Обращение не найдено." }, 500);
    }
    await notifyAdminsAboutCustomerMessage(createdTicket);

    return c.json({
      ok: true,
      ticket: await serializeTicket(createdTicket, role, isSupportAdmin),
      unreadCount: await getSupportUnreadCount({ userId, isSupportAdmin })
    });
  })
  .post("/tickets/:id/messages", async (c) => {
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    const isSupportAdmin = await canUseSupportAdmin(c, role);
    const idResult = z.string().uuid().safeParse(c.req.param("id"));
    if (!idResult.success) {
      return c.json({ error: "Invalid ticket id" }, 400);
    }

    const ticket = await getTicketById(idResult.data);
    if (!ticket || ticket.userId !== userId) {
      return c.json({ error: "Обращение не найдено." }, 404);
    }
    if (ticket.status === "closed") {
      return c.json({ error: "Обращение закрыто. Создайте новое, если вопрос снова актуален." }, 400);
    }

    const body = supportMessageCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Некорректное сообщение или вложение." }, 400);
    }
    const { message } = body.data;
    if (!message && body.data.attachments.length === 0) {
      return c.json({ error: "Напишите сообщение или приложите файл." }, 400);
    }
    let attachments: Awaited<ReturnType<typeof readSupportAttachments>>;
    try {
      attachments = await readSupportAttachments(userId, body.data.attachments);
    } catch (error) {
      logger.warn({ error, userId, ticketId: ticket.id }, "Unable to verify support follow-up attachments");
      return c.json({ error: "Не удалось проверить загруженный файл. Загрузите его повторно." }, 400);
    }

    const now = new Date();
    const [ticketMessage] = await db
      .insert(supportTicketMessages)
      .values({
        ticketId: ticket.id,
        authorUserId: userId,
        authorRole: "customer",
        body: message || "Вложение от клиента.",
        createdAt: now,
        updatedAt: now
      })
      .returning();

    if (!ticketMessage) {
      return c.json({ error: "Не удалось добавить сообщение." }, 500);
    }

    await persistSupportAttachments({ ticketId: ticket.id, messageId: ticketMessage.id, attachments, now });

    await db
      .update(supportTickets)
      .set({
        status: "open",
        lastCustomerMessageAt: now,
        customerReadAt: now,
        updatedAt: now
      })
      .where(eq(supportTickets.id, ticket.id));

    const updatedTicket = await getTicketById(ticket.id);
    if (!updatedTicket) {
      return c.json({ error: "Обращение не найдено." }, 500);
    }
    await notifyAdminsAboutCustomerMessage(updatedTicket);

    return c.json({
      ok: true,
      ticket: await serializeTicket(updatedTicket, role, isSupportAdmin),
      unreadCount: await getSupportUnreadCount({ userId, isSupportAdmin })
    });
  })
  .post("/tickets/:id/close", async (c) => {
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    const idResult = z.string().uuid().safeParse(c.req.param("id"));
    if (!idResult.success) {
      return c.json({ error: "Invalid ticket id" }, 400);
    }

    const ticket = await getTicketById(idResult.data);
    const isSupportAdmin = await canUseSupportAdmin(c, role);
    if (!ticket || (!isSupportAdmin && ticket.userId !== userId)) {
      return c.json({ error: "Обращение не найдено." }, 404);
    }

    const now = new Date();
    await db
      .update(supportTickets)
      .set({
        status: "closed",
        closedAt: now,
        closedByUserId: userId,
        customerReadAt: ticket.userId === userId ? now : ticket.customerReadAt,
        adminReadAt: isSupportAdmin ? now : ticket.adminReadAt,
        updatedAt: now
      })
      .where(and(eq(supportTickets.id, ticket.id), ne(supportTickets.status, "closed")));

    const updatedTicket = await getTicketById(ticket.id);
    if (!updatedTicket) {
      return c.json({ error: "Обращение не найдено." }, 500);
    }

    return c.json({
      ok: true,
      ticket: await serializeTicket(updatedTicket, role, isSupportAdmin),
      unreadCount: await getSupportUnreadCount({ userId, isSupportAdmin })
    });
  })
  .post("/tickets/:id/read", async (c) => {
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    const idResult = z.string().uuid().safeParse(c.req.param("id"));
    if (!idResult.success) {
      return c.json({ error: "Invalid ticket id" }, 400);
    }

    const ticket = await getTicketById(idResult.data);
    const isSupportAdmin = await canUseSupportAdmin(c, role);
    if (!ticket || (!isSupportAdmin && ticket.userId !== userId)) {
      return c.json({ error: "Обращение не найдено." }, 404);
    }

    await db
      .update(supportTickets)
      .set(isSupportAdmin ? { adminReadAt: new Date() } : { customerReadAt: new Date() })
      .where(eq(supportTickets.id, ticket.id));

    const updatedTicket = await getTicketById(ticket.id);
    if (!updatedTicket) {
      return c.json({ error: "Обращение не найдено." }, 500);
    }

    return c.json({
      ok: true,
      ticket: await serializeTicket(updatedTicket, role, isSupportAdmin),
      unreadCount: await getSupportUnreadCount({ userId, isSupportAdmin })
    });
  })
  .get("/admin/tickets", async (c) => {
    await cleanupExpiredSupportAttachments();
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    const isSupportAdmin = await canUseSupportAdmin(c, role);
    if (!isSupportAdmin) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const tickets = await db.query.supportTickets.findMany({
      orderBy: [desc(supportTickets.updatedAt)],
      limit: 100,
      with: {
        user: true,
        closedBy: true,
        messages: {
          orderBy: [asc(supportTicketMessages.createdAt)],
          limit: 200,
          with: {
            author: true,
            attachments: true
          }
        }
      }
    });

    return c.json({
      tickets: await Promise.all(tickets.map((ticket) => serializeTicket(ticket, role, isSupportAdmin))),
      unreadCount: await getSupportUnreadCount({ userId, isSupportAdmin })
    });
  })
  .post("/admin/users/:telegramId/tickets", async (c) => {
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    const isSupportAdmin = await canUseSupportAdmin(c, role);
    if (!isSupportAdmin) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const target = await db.query.users.findFirst({
      where: eq(users.telegramId, c.req.param("telegramId"))
    });
    if (!target) {
      return c.json({ error: "Клиент не найден." }, 404);
    }

    const body = supportMessageCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Некорректное сообщение или вложение." }, 400);
    }
    const { message } = body.data;
    if (!message && body.data.attachments.length === 0) {
      return c.json({ error: "Напишите сообщение или приложите файл." }, 400);
    }
    let attachments: Awaited<ReturnType<typeof readSupportAttachments>>;
    try {
      attachments = await readSupportAttachments(userId, body.data.attachments);
    } catch (error) {
      logger.warn({ error, userId, targetUserId: target.id }, "Unable to verify admin support attachments");
      return c.json({ error: "Не удалось проверить загруженный файл. Загрузите его повторно." }, 400);
    }

    const now = new Date();
    const [ticket] = await db
      .insert(supportTickets)
      .values({
        userId: target.id,
        topic: "other",
        customTopic: "Сообщение от клуба",
        message: message || "Вложение от поддержки.",
        status: "answered",
        lastCustomerMessageAt: now,
        lastAdminMessageAt: now,
        adminReadAt: now,
        customerReadAt: new Date(0),
        createdAt: now,
        updatedAt: now
      })
      .returning();

    if (!ticket) {
      return c.json({ error: "Не удалось создать обращение." }, 500);
    }

    const [ticketMessage] = await db
      .insert(supportTicketMessages)
      .values({
        ticketId: ticket.id,
        authorUserId: userId,
        authorRole: "admin",
        body: message || "Вложение от поддержки.",
        createdAt: now,
        updatedAt: now
      })
      .returning();

    if (!ticketMessage) {
      return c.json({ error: "Не удалось создать сообщение." }, 500);
    }

    await persistSupportAttachments({ ticketId: ticket.id, messageId: ticketMessage.id, attachments, now });

    const createdTicket = await getTicketById(ticket.id);
    if (!createdTicket) {
      return c.json({ error: "Обращение не найдено." }, 500);
    }

    await notifyCustomerAboutReply(createdTicket);

    await recordAdminAction(c, {
      action: "support.ticket.created_by_admin",
      entityType: "support_ticket",
      entityId: ticket.id,
      targetUserId: target.id,
      targetTelegramId: target.telegramId,
      summary: "Создал обращение клиенту от клуба",
      metadata: {
        hasMessage: Boolean(message),
        attachmentsCount: attachments.length
      }
    });

    return c.json({
      ok: true,
      ticket: await serializeTicket(createdTicket, role, isSupportAdmin),
      unreadCount: await getSupportUnreadCount({ userId, isSupportAdmin })
    });
  })
  .post("/admin/tickets/:id/replies", async (c) => {
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    const isSupportAdmin = await canUseSupportAdmin(c, role);
    if (!isSupportAdmin) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const idResult = z.string().uuid().safeParse(c.req.param("id"));
    if (!idResult.success) {
      return c.json({ error: "Invalid ticket id" }, 400);
    }

    const ticket = await getTicketById(idResult.data);
    if (!ticket) {
      return c.json({ error: "Обращение не найдено." }, 404);
    }
    if (ticket.status === "closed") {
      return c.json({ error: "Обращение уже закрыто." }, 400);
    }

    const body = supportMessageCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Некорректное сообщение или вложение." }, 400);
    }
    const { message } = body.data;
    if (!message && body.data.attachments.length === 0) {
      return c.json({ error: "Напишите ответ или приложите файл." }, 400);
    }
    let attachments: Awaited<ReturnType<typeof readSupportAttachments>>;
    try {
      attachments = await readSupportAttachments(userId, body.data.attachments);
    } catch (error) {
      logger.warn({ error, userId, ticketId: ticket.id }, "Unable to verify support reply attachments");
      return c.json({ error: "Не удалось проверить загруженный файл. Загрузите его повторно." }, 400);
    }

    const now = new Date();
    const [ticketMessage] = await db
      .insert(supportTicketMessages)
      .values({
        ticketId: ticket.id,
        authorUserId: userId,
        authorRole: "admin",
        body: message || "Вложение от поддержки.",
        createdAt: now,
        updatedAt: now
      })
      .returning();

    if (!ticketMessage) {
      return c.json({ error: "Не удалось создать ответ." }, 500);
    }

    await persistSupportAttachments({ ticketId: ticket.id, messageId: ticketMessage.id, attachments, now });

    await db
      .update(supportTickets)
      .set({
        status: "answered",
        lastAdminMessageAt: now,
        adminReadAt: now,
        updatedAt: now
      })
      .where(and(eq(supportTickets.id, ticket.id), ne(supportTickets.status, "closed")));

    const updatedTicket = await getTicketById(ticket.id);
    if (!updatedTicket) {
      return c.json({ error: "Обращение не найдено." }, 500);
    }

    await notifyCustomerAboutReply(updatedTicket);

    await recordAdminAction(c, {
      action: "support.ticket.replied",
      entityType: "support_ticket",
      entityId: ticket.id,
      targetUserId: ticket.user.id,
      targetTelegramId: ticket.user.telegramId,
      summary: "Ответил клиенту в поддержке",
      metadata: {
        hasMessage: Boolean(message),
        attachmentsCount: attachments.length
      }
    });

    return c.json({
      ok: true,
      ticket: await serializeTicket(updatedTicket, role, isSupportAdmin),
      unreadCount: await getSupportUnreadCount({ userId, isSupportAdmin })
    });
  });
