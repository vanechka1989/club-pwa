import { and, asc, desc, eq, inArray, isNotNull, lte, ne } from "drizzle-orm";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { recordAdminAction } from "../admin/actionLog";
import { getOwnerTelegramId, getUserRole, hasAdminPermission, isOwnerTelegramId } from "../admin/roles";
import { db } from "../db/client";
import { supportTicketAttachments, supportTicketMessages, supportTickets, users } from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { createAppNotification } from "../notifications/create";
import { deleteObject, getObjectReadUrl, uploadObject } from "../storage/s3";
import { optimizeImageForUpload } from "../storage/imageOptimizer";
import {
  buildSupportAttachmentObjectKey,
  getSupportAttachmentExpiresAt,
  getSupportAttachmentLimitError,
  getSupportAttachmentUploadContentType
} from "../support/mediaUpload";
import { selectSupportAdminTelegramIds } from "../support/adminNotificationRecipients";

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
  answered: "Отвечено",
  closed: "Закрыто"
};

const ticketTopicSchema = z.enum(["payment", "access", "media", "other"]);

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

function getFormString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getFormFiles(form: FormData) {
  return form
    .getAll("attachments")
    .filter((value): value is File => typeof value === "object" && value instanceof File && value.size > 0);
}

function getAttachmentLimitMessage(files: File[]) {
  const error = getSupportAttachmentLimitError(files);
  if (!error) {
    return null;
  }

  if (error === "too_many_files") {
    return "Можно приложить не больше 4 файлов.";
  }

  if (error === "file_too_large") {
    return "Файл слишком большой. Максимум 50 МБ на файл.";
  }

  return "Файлы слишком большие. Максимум 100 МБ за одно сообщение.";
}

async function getUnreadCount({ userId, isSupportAdmin }: { userId: string; isSupportAdmin: boolean }) {
  if (isSupportAdmin) {
    const tickets = await db.query.supportTickets.findMany({
      where: ne(supportTickets.status, "closed")
    });
    return tickets.filter((ticket) => isAfter(ticket.lastCustomerMessageAt, ticket.adminReadAt)).length;
  }

  const tickets = await db.query.supportTickets.findMany({
    where: eq(supportTickets.userId, userId)
  });
  return tickets.filter((ticket) => isAfter(ticket.lastAdminMessageAt, ticket.customerReadAt)).length;
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

async function uploadAttachments({
  ticketId,
  messageId,
  files
}: {
  ticketId: string;
  messageId: string;
  files: File[];
}) {
  for (const file of files) {
    const contentType = getSupportAttachmentUploadContentType(file.type, file.name);
    if (!contentType) {
      throw new Error("UNSUPPORTED_FILE_TYPE");
    }

    const id = randomUUID();
    const createdAt = new Date();
    const originalBytes = new Uint8Array(await file.arrayBuffer());
    const optimized = contentType.startsWith("image/")
      ? await optimizeImageForUpload({ bytes: originalBytes, contentType, fileName: file.name })
      : {
          body: originalBytes,
          contentType,
          fileName: file.name,
          sizeBytes: file.size
        };
    const key = buildSupportAttachmentObjectKey({ fileName: optimized.fileName, id, now: createdAt });
    await uploadObject({
      key,
      body: optimized.body,
      contentType: optimized.contentType
    });

    await db.insert(supportTicketAttachments).values({
      ticketId,
      messageId,
      kind: optimized.contentType.startsWith("video/") ? "video" : "photo",
      fileName: optimized.fileName || "attachment",
      objectKey: key,
      contentType: optimized.contentType,
      sizeBytes: optimized.sizeBytes,
      expiresAt: getSupportAttachmentExpiresAt(createdAt),
      createdAt
    });
  }
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
  .get("/", async (c) => {
    await cleanupExpiredSupportAttachments();
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    const isSupportAdmin = await canUseSupportAdmin(c, role);

    const tickets = await db.query.supportTickets.findMany({
      where: eq(supportTickets.userId, userId),
      orderBy: [desc(supportTickets.updatedAt)],
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

    return c.json({
      managerContact: null,
      topics: supportTopics,
      tickets: await Promise.all(tickets.map((ticket) => serializeTicket(ticket, role, isSupportAdmin))),
      unreadCount: await getUnreadCount({ userId, isSupportAdmin })
    });
  })
  .get("/unread", async (c) => {
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    const isSupportAdmin = await canUseSupportAdmin(c, role);

    return c.json({
      unreadCount: await getUnreadCount({ userId, isSupportAdmin })
    });
  })
  .post("/tickets", async (c) => {
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    const isSupportAdmin = await canUseSupportAdmin(c, role);
    const form = await c.req.formData();
    const topicResult = ticketTopicSchema.safeParse(getFormString(form, "topic"));
    const message = getFormString(form, "message");
    const customTopic = getFormString(form, "customTopic");

    if (!topicResult.success || !message) {
      return c.json({ error: "Заполните причину обращения и сообщение." }, 400);
    }

    if (topicResult.data === "other" && !customTopic) {
      return c.json({ error: "Напишите свою причину обращения." }, 400);
    }

    const files = getFormFiles(form);
    const attachmentLimitMessage = getAttachmentLimitMessage(files);
    if (attachmentLimitMessage) {
      return c.json({ error: attachmentLimitMessage }, 413);
    }
    const now = new Date();
    const [ticket] = await db
      .insert(supportTickets)
      .values({
        userId,
        topic: topicResult.data,
        customTopic: topicResult.data === "other" ? customTopic : null,
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

    try {
      await uploadAttachments({ ticketId: ticket.id, messageId: ticketMessage.id, files });
    } catch (error) {
      logger.warn({ error, ticketId: ticket.id }, "Unable to upload support attachment");
      return c.json({ error: "Файл не подходит. Можно загрузить фото или видео." }, 400);
    }

    const createdTicket = await getTicketById(ticket.id);
    if (!createdTicket) {
      return c.json({ error: "Обращение не найдено." }, 500);
    }
    await notifyAdminsAboutCustomerMessage(createdTicket);

    return c.json({
      ok: true,
      ticket: await serializeTicket(createdTicket, role, isSupportAdmin),
      unreadCount: await getUnreadCount({ userId, isSupportAdmin })
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

    const form = await c.req.formData();
    const message = getFormString(form, "message");
    const files = getFormFiles(form);
    const attachmentLimitMessage = getAttachmentLimitMessage(files);
    if (attachmentLimitMessage) {
      return c.json({ error: attachmentLimitMessage }, 413);
    }
    if (!message && files.length === 0) {
      return c.json({ error: "Напишите сообщение или приложите файл." }, 400);
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

    try {
      await uploadAttachments({ ticketId: ticket.id, messageId: ticketMessage.id, files });
    } catch (error) {
      logger.warn({ error, ticketId: ticket.id }, "Unable to upload support follow-up attachment");
      return c.json({ error: "Файл не подходит. Можно загрузить фото или видео." }, 400);
    }

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
      unreadCount: await getUnreadCount({ userId, isSupportAdmin })
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
      unreadCount: await getUnreadCount({ userId, isSupportAdmin })
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
      unreadCount: await getUnreadCount({ userId, isSupportAdmin })
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

    return c.json({
      tickets: await Promise.all(tickets.map((ticket) => serializeTicket(ticket, role, isSupportAdmin))),
      unreadCount: await getUnreadCount({ userId, isSupportAdmin })
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

    const form = await c.req.formData();
    const message = getFormString(form, "message");
    const files = getFormFiles(form);
    const attachmentLimitMessage = getAttachmentLimitMessage(files);
    if (attachmentLimitMessage) {
      return c.json({ error: attachmentLimitMessage }, 413);
    }
    if (!message && files.length === 0) {
      return c.json({ error: "Напишите сообщение или приложите файл." }, 400);
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

    try {
      await uploadAttachments({ ticketId: ticket.id, messageId: ticketMessage.id, files });
    } catch (error) {
      logger.warn({ error, ticketId: ticket.id }, "Unable to upload admin support attachment");
      return c.json({ error: "Файл не подходит. Можно загрузить фото или видео." }, 400);
    }

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
        attachmentsCount: files.length
      }
    });

    return c.json({
      ok: true,
      ticket: await serializeTicket(createdTicket, role, isSupportAdmin),
      unreadCount: await getUnreadCount({ userId, isSupportAdmin })
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

    const form = await c.req.formData();
    const message = getFormString(form, "message");
    const files = getFormFiles(form);
    const attachmentLimitMessage = getAttachmentLimitMessage(files);
    if (attachmentLimitMessage) {
      return c.json({ error: attachmentLimitMessage }, 413);
    }
    if (!message && files.length === 0) {
      return c.json({ error: "Напишите ответ или приложите файл." }, 400);
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

    try {
      await uploadAttachments({ ticketId: ticket.id, messageId: ticketMessage.id, files });
    } catch (error) {
      logger.warn({ error, ticketId: ticket.id }, "Unable to upload support reply attachment");
      return c.json({ error: "Файл не подходит. Можно загрузить фото или видео." }, 400);
    }

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
        attachmentsCount: files.length
      }
    });

    return c.json({
      ok: true,
      ticket: await serializeTicket(updatedTicket, role, isSupportAdmin),
      unreadCount: await getUnreadCount({ userId, isSupportAdmin })
    });
  });
