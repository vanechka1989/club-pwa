import { and, count, desc, eq, gt, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { ClubChat, ClubMessage, ClubTopic } from "@club/shared";
import { getUserRole } from "../admin/roles";
import { buildReplyPreview, summarizeReactions } from "../community/messageMetadata";
import { formatMuteDuration, formatMuteSystemMessage, formatUnmuteSystemMessage } from "../community/muteNotice";
import { getArchiveExpirationDate } from "../community/topicArchive";
import { db } from "../db/client";
import { clubChatMessages, clubChatTopics, clubChats, clubMessageReactions, userMutes, users } from "../db/schema";
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
  body: z.string().trim().min(1).max(3000),
  replyToMessageId: z.string().uuid().nullable().optional()
});

const reactionPayloadSchema = z.object({
  reaction: z.enum(["like", "dislike"]).nullable()
});

const chatMutePayloadSchema = z.object({
  telegramId: z.string().trim().regex(/^\d{3,32}$/),
  kind: z.enum(["temporary", "permanent"]),
  reason: z.string().trim().max(1000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional()
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
        : and(
            eq(clubChatTopics.chatId, chat.id),
            or(eq(clubChatTopics.isPublished, true), gt(clubChatTopics.archivedUntil, new Date()))
          ),
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
    archivedUntil: topic.archivedUntil?.toISOString() ?? null,
    messagesCount: messagesRow?.value ?? 0,
    createdAt: topic.createdAt.toISOString()
  };
}

async function serializeMessage(
  message: typeof clubChatMessages.$inferSelect & {
    user: { id: string; telegramId: string; firstName: string | null; username: string | null };
  },
  currentUserId: string
): Promise<ClubMessage> {
  const reactions = await db.query.clubMessageReactions.findMany({
    where: eq(clubMessageReactions.messageId, message.id)
  });
  const replyTo = message.replyToMessageId
    ? await db.query.clubChatMessages.findFirst({
        where: eq(clubChatMessages.id, message.replyToMessageId),
        with: {
          user: true
        }
      })
    : null;
  const reactionSummary = summarizeReactions(reactions, currentUserId);
  const authorMute = await getActiveMute(message.user.id);

  return {
    id: message.id,
    topicId: message.topicId,
    body: message.body,
    isSystem: message.isSystem,
    status: message.status,
    author: {
      id: message.user.id,
      telegramId: message.user.telegramId,
      firstName: message.user.firstName,
      username: message.user.username
    },
    replyTo: buildReplyPreview(replyTo ?? null),
    likesCount: reactionSummary.likesCount,
    dislikesCount: reactionSummary.dislikesCount,
    myReaction: reactionSummary.myReaction,
    authorMute: authorMute
      ? {
          id: authorMute.id,
          kind: authorMute.kind,
          expiresAt: authorMute.expiresAt?.toISOString() ?? null
        }
      : null,
    createdAt: message.createdAt.toISOString()
  };
}

async function findMessageWithUser(id: string) {
  return db.query.clubChatMessages.findFirst({
    where: eq(clubChatMessages.id, id),
    with: {
      user: true
    }
  });
}

async function findOrCreateUserByTelegramId(telegramId: string) {
  const [createdUser] = await db
    .insert(users)
    .values({
      telegramId,
      firstName: null,
      username: null
    })
    .onConflictDoUpdate({
      target: users.telegramId,
      set: {
        updatedAt: new Date()
      }
    })
    .returning();

  return (
    createdUser ??
    (await db.query.users.findFirst({
      where: eq(users.telegramId, telegramId)
    }))
  );
}

function userName(user: { telegramId: string; firstName: string | null; username: string | null }) {
  return user.firstName || user.username || `ID ${user.telegramId}`;
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
          : and(
              eq(clubChatTopics.chatId, chat.id),
              or(eq(clubChatTopics.isPublished, true), gt(clubChatTopics.archivedUntil, new Date()))
            ),
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
        ...(body.data.isPublished === undefined
          ? {}
          : {
              isPublished: body.data.isPublished,
              archivedUntil: body.data.isPublished ? null : getArchiveExpirationDate()
            }),
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
      messages: await Promise.all(messages.map((message) => serializeMessage(message, c.get("userId")))),
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

    if (body.data.replyToMessageId) {
      const replyToMessage = await db.query.clubChatMessages.findFirst({
        where: and(eq(clubChatMessages.id, body.data.replyToMessageId), eq(clubChatMessages.topicId, topic.id))
      });

      if (!replyToMessage) {
        return c.json({ error: "Reply message not found" }, 404);
      }
    }

    const [message] = await db
      .insert(clubChatMessages)
      .values({
        topicId: topic.id,
        userId: c.get("userId"),
        replyToMessageId: body.data.replyToMessageId ?? null,
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
      message: await serializeMessage(createdMessage, c.get("userId"))
    });
  })
  .post("/topics/:id/mutes", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (role === "member") {
      return c.json({ error: "Moderator access required" }, 403);
    }

    const body = chatMutePayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid mute payload" }, 400);
    }

    const topic = await db.query.clubChatTopics.findFirst({
      where: eq(clubChatTopics.id, c.req.param("id"))
    });
    if (!topic) {
      return c.json({ error: "Topic not found" }, 404);
    }

    const targetUser = await findOrCreateUserByTelegramId(body.data.telegramId);
    const moderator = await db.query.users.findFirst({
      where: eq(users.id, c.get("userId"))
    });
    if (!targetUser || !moderator) {
      return c.json({ error: "Unable to resolve mute users" }, 500);
    }

    const expiresAt =
      body.data.kind === "temporary"
        ? body.data.expiresAt
          ? new Date(body.data.expiresAt)
          : new Date(Date.now() + 24 * 60 * 60 * 1000)
        : null;

    await db.insert(userMutes).values({
      userId: targetUser.id,
      kind: body.data.kind,
      reason: body.data.reason ?? null,
      expiresAt,
      createdByUserId: c.get("userId")
    });

    const [systemMessage] = await db
      .insert(clubChatMessages)
      .values({
        topicId: topic.id,
        userId: c.get("userId"),
        isSystem: true,
        body: formatMuteSystemMessage({
          moderatorName: userName(moderator),
          targetName: userName(targetUser),
          duration: formatMuteDuration(body.data.kind, expiresAt)
        })
      })
      .returning();

    const createdMessage = systemMessage ? await findMessageWithUser(systemMessage.id) : null;
    if (!createdMessage) {
      return c.json({ error: "Unable to create mute notice" }, 500);
    }

    return c.json({
      ok: true,
      message: await serializeMessage(createdMessage, c.get("userId"))
    });
  })
  .delete("/topics/:topicId/mutes/:muteId", async (c) => {
    const role = await getUserRole(c.get("telegramUser").id);
    if (role === "member") {
      return c.json({ error: "Moderator access required" }, 403);
    }

    const topic = await db.query.clubChatTopics.findFirst({
      where: eq(clubChatTopics.id, c.req.param("topicId"))
    });
    if (!topic) {
      return c.json({ error: "Topic not found" }, 404);
    }

    const mute = await db.query.userMutes.findFirst({
      where: eq(userMutes.id, c.req.param("muteId")),
      with: {
        user: true
      }
    });
    const moderator = await db.query.users.findFirst({
      where: eq(users.id, c.get("userId"))
    });
    if (!mute || !moderator) {
      return c.json({ error: "Mute not found" }, 404);
    }

    await db
      .update(userMutes)
      .set({
        revokedAt: new Date(),
        revokedByUserId: c.get("userId"),
        updatedAt: new Date()
      })
      .where(eq(userMutes.id, mute.id));

    const [systemMessage] = await db
      .insert(clubChatMessages)
      .values({
        topicId: topic.id,
        userId: c.get("userId"),
        isSystem: true,
        body: formatUnmuteSystemMessage({
          moderatorName: userName(moderator),
          targetName: userName(mute.user)
        })
      })
      .returning();

    const createdMessage = systemMessage ? await findMessageWithUser(systemMessage.id) : null;
    if (!createdMessage) {
      return c.json({ error: "Unable to create unmute notice" }, 500);
    }

    return c.json({
      ok: true,
      message: await serializeMessage(createdMessage, c.get("userId"))
    });
  })
  .post("/messages/:id/reaction", async (c) => {
    const body = reactionPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid reaction" }, 400);
    }

    const message = await db.query.clubChatMessages.findFirst({
      where: eq(clubChatMessages.id, c.req.param("id"))
    });

    if (!message) {
      return c.json({ error: "Message not found" }, 404);
    }

    if (body.data.reaction === null) {
      await db
        .delete(clubMessageReactions)
        .where(and(eq(clubMessageReactions.messageId, message.id), eq(clubMessageReactions.userId, c.get("userId"))));
    } else {
      await db
        .insert(clubMessageReactions)
        .values({
          messageId: message.id,
          userId: c.get("userId"),
          reaction: body.data.reaction
        })
        .onConflictDoUpdate({
          target: [clubMessageReactions.messageId, clubMessageReactions.userId],
          set: {
            reaction: body.data.reaction,
            updatedAt: new Date()
          }
        });
    }

    const updatedMessage = await findMessageWithUser(message.id);
    if (!updatedMessage) {
      return c.json({ error: "Message not found" }, 404);
    }

    return c.json({
      ok: true,
      message: await serializeMessage(updatedMessage, c.get("userId"))
    });
  });
