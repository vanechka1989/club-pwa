import { and, count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { ClubChat, ClubMessage, ClubTopic } from "@club/shared";
import { getUserRole } from "../admin/roles";
import { db } from "../db/client";
import { clubChatMessages, clubChatTopics, clubChats } from "../db/schema";
import { getActiveMute } from "../moderation/mutes";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";

const chatPayloadSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).nullable().optional()
});

const topicPayloadSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1000).nullable().optional()
});

const messagePayloadSchema = z.object({
  body: z.string().trim().min(1).max(3000)
});

const topicSettingsSchema = z.object({
  isLocked: z.boolean().optional(),
  isPublished: z.boolean().optional()
});

const systemChatSlug = "club-community";
const defaultTopics = [
  {
    title: "Новости клуба",
    description: "Важные объявления и обновления клуба.",
    isPinned: true
  },
  {
    title: "Общение",
    description: "Основной чат участников клуба.",
    isPinned: false
  }
] as const;

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `chat-${Date.now()}`;
}

async function serializeChat(chat: typeof clubChats.$inferSelect): Promise<ClubChat> {
  const [topicsRow] = await db
    .select({ value: count(clubChatTopics.id) })
    .from(clubChatTopics)
    .where(eq(clubChatTopics.chatId, chat.id));

  return {
    id: chat.id,
    slug: chat.slug,
    title: chat.title,
    description: chat.description,
    topicsCount: topicsRow?.value ?? 0
  };
}

async function getOrCreateSystemChat() {
  const existing = await db.query.clubChats.findFirst({
    where: eq(clubChats.slug, systemChatSlug)
  });

  if (existing) {
    return existing;
  }

  const [chat] = await db
    .insert(clubChats)
    .values({
      slug: systemChatSlug,
      title: "Общение",
      description: "Системный контейнер тем клуба.",
      isPublished: true,
      sortOrder: 0
    })
    .onConflictDoUpdate({
      target: clubChats.slug,
      set: {
        title: "Общение",
        isPublished: true,
        updatedAt: new Date()
      }
    })
    .returning();

  if (!chat) {
    throw new Error("Community chat was not created");
  }

  return chat;
}

async function ensureDefaultTopics(chatId: string) {
  const existingTopics = await db.query.clubChatTopics.findMany({
    where: eq(clubChatTopics.chatId, chatId)
  });
  const existingTitles = new Set(existingTopics.map((topic) => topic.title.toLowerCase()));
  const missingTopics = defaultTopics.filter((topic) => !existingTitles.has(topic.title.toLowerCase()));

  if (!missingTopics.length) {
    return;
  }

  await db.insert(clubChatTopics).values(
    missingTopics.map((topic) => ({
      chatId,
      title: topic.title,
      description: topic.description,
      isPinned: topic.isPinned,
      isPublished: true
    }))
  );
}

async function listCommunityTopics(role: Awaited<ReturnType<typeof getUserRole>>) {
  const chat = await getOrCreateSystemChat();
  await ensureDefaultTopics(chat.id);

  const topics = await db.query.clubChatTopics.findMany({
    where:
      role === "member"
        ? and(eq(clubChatTopics.chatId, chat.id), eq(clubChatTopics.isPublished, true))
        : eq(clubChatTopics.chatId, chat.id),
    orderBy: [desc(clubChatTopics.isPinned), desc(clubChatTopics.createdAt)]
  });

  return Promise.all(topics.map(serializeTopic));
}

async function serializeTopic(topic: typeof clubChatTopics.$inferSelect): Promise<ClubTopic> {
  const [messagesRow] = await db
    .select({ value: count(clubChatMessages.id) })
    .from(clubChatMessages)
    .where(and(eq(clubChatMessages.topicId, topic.id), eq(clubChatMessages.status, "visible")));

  return {
    id: topic.id,
    chatId: topic.chatId,
    title: topic.title,
    description: topic.description,
    isPinned: topic.isPinned,
    isLocked: topic.isLocked,
    isPublished: topic.isPublished,
    messagesCount: messagesRow?.value ?? 0,
    createdAt: topic.createdAt.toISOString()
  };
}

function serializeMessage(
  message: typeof clubChatMessages.$inferSelect & {
    user: { id: string; telegramId: string; firstName: string | null; username: string | null };
  }
): ClubMessage {
  return {
    id: message.id,
    topicId: message.topicId,
    body: message.body,
    status: message.status,
    author: {
      id: message.user.id,
      telegramId: message.user.telegramId,
      firstName: message.user.firstName,
      username: message.user.username
    },
    createdAt: message.createdAt.toISOString()
  };
}

function serializeMute(mute: Awaited<ReturnType<typeof getActiveMute>>) {
  return {
    mutedUntil: mute?.kind === "temporary" ? (mute.expiresAt?.toISOString() ?? null) : null,
    mutedPermanently: mute?.kind === "permanent"
  };
}

export const communityRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .get("/topics", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);

    return c.json({
      topics: await listCommunityTopics(role)
    });
  })
  .post("/topics", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (role === "member") {
      return c.json({ error: "Moderator access required" }, 403);
    }

    const body = topicPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid topic" }, 400);
    }

    const chat = await getOrCreateSystemChat();
    const [topic] = await db
      .insert(clubChatTopics)
      .values({
        chatId: chat.id,
        title: body.data.title,
        description: body.data.description ?? null,
        createdByUserId: c.get("userId")
      })
      .returning();

    if (!topic) {
      return c.json({ error: "Unable to create topic" }, 500);
    }

    return c.json({
      ok: true,
      topic: await serializeTopic(topic)
    });
  })
  .get("/chats", async (c) => {
    const chats = await db.query.clubChats.findMany({
      where: eq(clubChats.isPublished, true),
      orderBy: (table, { asc }) => [asc(table.sortOrder), asc(table.createdAt)]
    });

    return c.json({
      chats: await Promise.all(chats.map(serializeChat))
    });
  })
  .post("/chats", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (role === "member") {
      return c.json({ error: "Moderator access required" }, 403);
    }

    const body = chatPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid chat" }, 400);
    }

    const [chat] = await db
      .insert(clubChats)
      .values({
        title: body.data.title,
        slug: `${slugify(body.data.title)}-${Date.now().toString(36)}`,
        description: body.data.description ?? null,
        createdByUserId: c.get("userId")
      })
      .returning();

    if (!chat) {
      return c.json({ error: "Unable to create chat" }, 500);
    }

    return c.json({
      ok: true,
      chat: await serializeChat(chat)
    });
  })
  .get("/chats/:id/topics", async (c) => {
    const chat = await db.query.clubChats.findFirst({
      where: and(eq(clubChats.id, c.req.param("id")), eq(clubChats.isPublished, true))
    });

    if (!chat) {
      return c.json({ error: "Chat not found" }, 404);
    }

    const role = await getUserRole(c.get("telegramUser").id);
    const topics = await db.query.clubChatTopics.findMany({
      where:
        role === "member"
          ? and(eq(clubChatTopics.chatId, chat.id), eq(clubChatTopics.isPublished, true))
          : eq(clubChatTopics.chatId, chat.id),
      orderBy: [desc(clubChatTopics.isPinned), desc(clubChatTopics.createdAt)]
    });

    return c.json({
      topics: await Promise.all(topics.map(serializeTopic))
    });
  })
  .post("/chats/:id/topics", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (role === "member") {
      return c.json({ error: "Moderator access required" }, 403);
    }

    const mute = await getActiveMute(c.get("userId"));
    if (mute) {
      return c.json({ error: "User is muted", ...serializeMute(mute) }, 403);
    }

    const body = topicPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid topic" }, 400);
    }

    const chat = await db.query.clubChats.findFirst({
      where: and(eq(clubChats.id, c.req.param("id")), eq(clubChats.isPublished, true))
    });

    if (!chat) {
      return c.json({ error: "Chat not found" }, 404);
    }

    const [topic] = await db
      .insert(clubChatTopics)
      .values({
        chatId: chat.id,
        title: body.data.title,
        description: body.data.description ?? null,
        createdByUserId: c.get("userId")
      })
      .returning();

    if (!topic) {
      return c.json({ error: "Unable to create topic" }, 500);
    }

    return c.json({
      ok: true,
      topic: await serializeTopic(topic)
    });
  })
  .post("/topics/:id/settings", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (role === "member") {
      return c.json({ error: "Moderator access required" }, 403);
    }

    const body = topicSettingsSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid topic settings" }, 400);
    }

    const [topic] = await db
      .update(clubChatTopics)
      .set({
        ...(body.data.isLocked === undefined ? {} : { isLocked: body.data.isLocked }),
        ...(body.data.isPublished === undefined ? {} : { isPublished: body.data.isPublished }),
        updatedAt: new Date()
      })
      .where(eq(clubChatTopics.id, c.req.param("id")))
      .returning();

    if (!topic) {
      return c.json({ error: "Topic not found" }, 404);
    }

    return c.json({
      ok: true,
      topic: await serializeTopic(topic)
    });
  })
  .get("/topics/:id/messages", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    const topic = await db.query.clubChatTopics.findFirst({
      where: eq(clubChatTopics.id, c.req.param("id"))
    });

    if (!topic) {
      return c.json({ error: "Topic not found" }, 404);
    }

    const messages = await db.query.clubChatMessages.findMany({
      where:
        role === "member"
          ? and(eq(clubChatMessages.topicId, topic.id), eq(clubChatMessages.status, "visible"))
          : eq(clubChatMessages.topicId, topic.id),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 50,
      with: {
        user: true
      }
    });
    const mute = await getActiveMute(c.get("userId"));

    return c.json({
      messages: messages.map(serializeMessage),
      ...serializeMute(mute)
    });
  })
  .post("/topics/:id/messages", async (c) => {
    const mute = await getActiveMute(c.get("userId"));
    if (mute) {
      return c.json({ error: "User is muted", ...serializeMute(mute) }, 403);
    }

    const body = messagePayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid message" }, 400);
    }

    const topic = await db.query.clubChatTopics.findFirst({
      where: eq(clubChatTopics.id, c.req.param("id"))
    });

    if (!topic) {
      return c.json({ error: "Topic not found" }, 404);
    }

    if (topic.isLocked) {
      return c.json({ error: "Topic is locked" }, 403);
    }

    const [message] = await db
      .insert(clubChatMessages)
      .values({
        topicId: topic.id,
        userId: c.get("userId"),
        body: body.data.body
      })
      .returning();

    if (!message) {
      return c.json({ error: "Unable to create message" }, 500);
    }

    const createdMessage = await db.query.clubChatMessages.findFirst({
      where: eq(clubChatMessages.id, message.id),
      with: {
        user: true
      }
    });

    if (!createdMessage) {
      return c.json({ error: "Unable to create message" }, 500);
    }

    return c.json({
      ok: true,
      message: serializeMessage(createdMessage)
    });
  });
