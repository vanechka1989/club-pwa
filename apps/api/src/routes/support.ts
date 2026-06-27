import { and, asc, desc, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getUserRole } from "../admin/roles";
import { db } from "../db/client";
import { supportTicketAttachments, supportTicketMessages, supportTickets } from "../db/schema";
import { env } from "../env";
import { logger } from "../logger";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { getObjectReadUrl, uploadObject } from "../storage/s3";
import { buildSupportAttachmentObjectKey, getSupportAttachmentUploadContentType } from "../support/mediaUpload";
import { sendTelegramMessage } from "../telegram/client";

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
    title: "Фото или видео",
    description: "Проблемы с загрузкой, просмотром или воспроизведением."
  },
  {
    id: "other",
    title: "Другая причина",
    description: "Если подходящей причины нет в списке."
  }
];

const ticketStatusLabel: Record<string, string> = {
  open: "Ожидает ответа",
  answered: "Ответ получен",
  closed: "Закрыто"
};

const ticketTopicSchema = z.enum(["payment", "access", "media", "other"]);

function isAdminRole(role: string) {
  return role === "admin" || role === "owner";
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
    .filter((value): value is File => typeof value === "object" && value instanceof File && value.size > 0)
    .slice(0, 4);
}

async function getUnreadCount({ userId, role }: { userId: string; role: string }) {
  if (isAdminRole(role)) {
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
  viewerRole: string
) {
  const topic = supportTopics.find((item) => item.id === ticket.topic);
  const messages = await Promise.all(
    ticket.messages.map(async (message) => ({
      id: message.id,
      authorRole: message.authorRole as "customer" | "admin",
      body: message.body,
      author: {
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
    statusLabel: ticketStatusLabel[ticket.status] ?? ticket.status,
    waitingSince: ticket.status === "open" ? ticket.lastCustomerMessageAt.toISOString() : null,
    customer: {
      telegramId: ticket.user.telegramId,
      firstName: ticket.user.firstName,
      username: ticket.user.username,
      photoUrl: ticket.user.photoUrl
    },
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
    const key = buildSupportAttachmentObjectKey({ fileName: file.name, id, now: new Date() });
    await uploadObject({
      key,
      body: new Uint8Array(await file.arrayBuffer()),
      contentType
    });

    await db.insert(supportTicketAttachments).values({
      ticketId,
      messageId,
      kind: contentType.startsWith("video/") ? "video" : "photo",
      fileName: file.name || "attachment",
      objectKey: key,
      contentType,
      sizeBytes: file.size
    });
  }
}

async function notifyCustomerAboutReply(ticket: NonNullable<Awaited<ReturnType<typeof getTicketById>>>) {
  try {
    await sendTelegramMessage({
      chatId: ticket.user.telegramId,
      text: "Вам ответили в поддержке. Откройте приложение, чтобы посмотреть ответ.",
      replyMarkup: {
        inline_keyboard: [[{ text: "Открыть клуб", url: env.WEB_ORIGIN }]]
      }
    });
  } catch (error) {
    logger.warn({ error, ticketId: ticket.id }, "Unable to send support reply notification");
  }
}

export const supportRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .get("/", async (c) => {
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));

    await db
      .update(supportTickets)
      .set({ customerReadAt: new Date() })
      .where(eq(supportTickets.userId, userId));

    const tickets = await db.query.supportTickets.findMany({
      where: eq(supportTickets.userId, userId),
      orderBy: [desc(supportTickets.updatedAt)],
      with: {
        user: true,
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
      tickets: await Promise.all(tickets.map((ticket) => serializeTicket(ticket, role))),
      unreadCount: 0
    });
  })
  .get("/unread", async (c) => {
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));

    return c.json({
      unreadCount: await getUnreadCount({ userId, role })
    });
  })
  .post("/tickets", async (c) => {
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
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

    return c.json({
      ok: true,
      ticket: await serializeTicket(createdTicket, role),
      unreadCount: await getUnreadCount({ userId, role })
    });
  })
  .get("/admin/tickets", async (c) => {
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    if (!isAdminRole(role)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await db
      .update(supportTickets)
      .set({ adminReadAt: new Date() })
      .where(ne(supportTickets.status, "closed"));

    const tickets = await db.query.supportTickets.findMany({
      orderBy: [desc(supportTickets.updatedAt)],
      with: {
        user: true,
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
      tickets: await Promise.all(tickets.map((ticket) => serializeTicket(ticket, role))),
      unreadCount: 0
    });
  })
  .post("/admin/tickets/:id/replies", async (c) => {
    const userId = c.get("userId");
    const role = c.get("previewRole") ?? (await getUserRole(c.get("telegramUser").id));
    if (!isAdminRole(role)) {
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

    return c.json({
      ok: true,
      ticket: await serializeTicket(updatedTicket, role),
      unreadCount: await getUnreadCount({ userId, role })
    });
  });
