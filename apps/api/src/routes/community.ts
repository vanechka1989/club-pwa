import { and, count, desc, eq, gt, lte, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { ClubChat, ClubMessage, ClubTopic } from "@club/shared";
import { getUserRole, hasAdminPermission, isOwnerTelegramId } from "../admin/roles";
import { getMessagePurgeAt, shouldHardDeleteMessages } from "../community/messageDeletion";
import { buildMessageAuthor, buildReplyPreview, summarizeReactions } from "../community/messageMetadata";
import { formatMuteDuration, formatMuteSystemMessage, formatUnmuteSystemMessage } from "../community/muteNotice";
import { formatReplyNotificationText } from "../community/replyNotification";
import { getArchiveExpirationDate } from "../community/topicArchive";
import { getCommunityMediaExpiry } from "../community/mediaPolicy";
import { buildCommunityMediaObjectKey, communityVoiceMaxBytes, getCommunityVoiceContentType, prepareCommunityImage, validateCommunityImageFiles } from "../community/mediaUpload";
import { normalizePollDraft, validatePollSelection } from "../community/polls";
import { db } from "../db/client";
import { clubChatMessages, clubChatTopics, clubChats, clubMessageAttachments, clubMessageReactions, clubPollOptions, clubPolls, clubPollVotes, userMutes, users } from "../db/schema";
import { logger } from "../logger";
import { getMembership } from "../membership/getMembership";
import { getActiveMute } from "../moderation/mutes";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { createAppNotification } from "../notifications/create";
import { deleteObject, getObjectReadUrl, uploadObject } from "../storage/s3";

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

const pollPayloadSchema = z.object({
  question: z.string().max(500),
  options: z.array(z.string().max(300)).min(2).max(10),
  allowsMultiple: z.boolean().default(false),
  isAnonymous: z.boolean().default(true),
  closesAt: z.string().datetime().nullable().optional(),
  replyToMessageId: z.string().uuid().nullable().optional()
});

const pollVotePayloadSchema = z.object({ optionIds: z.array(z.string().uuid()).min(1).max(10) });

const reactionPayloadSchema = z.object({
  reaction: z.enum(["thumbs_up", "fire", "heart", "laugh", "clap", "poop"]).nullable()
});

const chatMutePayloadSchema = z.object({
  telegramId: z.string().trim().min(3).max(320),
  kind: z.enum(["temporary", "permanent"]),
  reason: z.string().trim().max(1000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional()
});

const deleteAuthorMessagesPayloadSchema = z.object({
  telegramId: z.string().trim().min(3).max(320)
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

async function listCommunityTopics(role: Awaited<ReturnType<typeof getUserRole>>, currentUserId: string) {
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

  return Promise.all(topics.map((topic) => serializeTopic(topic, currentUserId)));
}

async function getLatestReplyToMeAt(topicId: string, currentUserId: string) {
  const originalMessage = alias(clubChatMessages, "original_message");
  const [reply] = await db
    .select({ createdAt: clubChatMessages.createdAt })
    .from(clubChatMessages)
    .innerJoin(originalMessage, eq(clubChatMessages.replyToMessageId, originalMessage.id))
    .where(
      and(
        eq(clubChatMessages.topicId, topicId),
        eq(clubChatMessages.status, "visible"),
        eq(originalMessage.userId, currentUserId),
        ne(clubChatMessages.userId, currentUserId)
      )
    )
    .orderBy(desc(clubChatMessages.createdAt))
    .limit(1);

  return reply?.createdAt ?? null;
}

async function serializeTopic(topic: typeof clubChatTopics.$inferSelect, currentUserId: string): Promise<ClubTopic> {
  const [messagesRow] = await db
    .select({ value: count(clubChatMessages.id) })
    .from(clubChatMessages)
    .where(and(eq(clubChatMessages.topicId, topic.id), eq(clubChatMessages.status, "visible")));
  const latestReplyToMeAt = await getLatestReplyToMeAt(topic.id, currentUserId);

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
    latestReplyToMeAt: latestReplyToMeAt?.toISOString() ?? null,
    createdAt: topic.createdAt.toISOString()
  };
}

async function serializeMessage(
  message: typeof clubChatMessages.$inferSelect & {
    user: {
      id: string;
      telegramId: string;
      firstName: string | null;
      username: string | null;
      photoUrl: string | null;
      avatarPositionX?: number | null;
      avatarPositionY?: number | null;
      avatarScale?: number | null;
    };
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
  const attachments = await db.query.clubMessageAttachments.findMany({
    where: eq(clubMessageAttachments.messageId, message.id),
    orderBy: (table, { asc }) => [asc(table.sortOrder)]
  });
  const kind = (message.kind as ClubMessage["kind"]) ?? "text";
  const serializedAttachments = await Promise.all(
    attachments.map(async (attachment) => ({
      ...attachment,
      url: attachment.deletedAt ? null : await getObjectReadUrl(attachment.objectKey)
    }))
  );
  const voiceAttachment = kind === "voice" ? serializedAttachments[0] : undefined;
  const imageAttachments = kind === "images" ? serializedAttachments : [];
  const pollRecord = kind === "poll"
    ? await db.query.clubPolls.findFirst({
        where: eq(clubPolls.messageId, message.id),
        with: { options: true, votes: true }
      })
    : null;
  const pollVoterIds = new Set(pollRecord?.votes.map((vote) => vote.userId) ?? []);

  return {
    id: message.id,
    topicId: message.topicId,
    body: message.body,
    kind,
    voice: voiceAttachment
      ? {
          id: voiceAttachment.id,
          url: voiceAttachment.url,
          contentType: voiceAttachment.contentType,
          sizeBytes: voiceAttachment.sizeBytes,
          durationSeconds: voiceAttachment.durationSeconds ?? 0,
          expiresAt: voiceAttachment.expiresAt?.toISOString() ?? null,
          deletedAt: voiceAttachment.deletedAt?.toISOString() ?? null
        }
      : null,
    images: imageAttachments.map((attachment) => ({
      id: attachment.id,
      url: attachment.url,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      width: attachment.width ?? 1,
      height: attachment.height ?? 1,
      expiresAt: attachment.expiresAt?.toISOString() ?? null,
      deletedAt: attachment.deletedAt?.toISOString() ?? null
    })),
    poll: pollRecord
      ? {
          id: pollRecord.id,
          question: pollRecord.question,
          allowsMultiple: pollRecord.allowsMultiple,
          isAnonymous: pollRecord.isAnonymous,
          closesAt: pollRecord.closesAt?.toISOString() ?? null,
          closedAt: pollRecord.closedAt?.toISOString() ?? (pollRecord.closesAt && pollRecord.closesAt <= new Date() ? pollRecord.closesAt.toISOString() : null),
          totalVoters: pollVoterIds.size,
          options: [...pollRecord.options].sort((a, b) => a.sortOrder - b.sortOrder).map((option) => {
            const votesCount = pollRecord.votes.filter((vote) => vote.optionId === option.id).length;
            return {
              id: option.id,
              text: option.text,
              votesCount,
              percent: pollVoterIds.size ? Math.round((votesCount / pollVoterIds.size) * 100) : 0,
              selected: pollRecord.votes.some((vote) => vote.optionId === option.id && vote.userId === currentUserId)
            };
          }),
          voterDetails: null
        }
      : null,
    isSystem: message.isSystem,
    status: message.status,
    author: buildMessageAuthor(message.user),
    replyTo: buildReplyPreview(replyTo ?? null),
    likesCount: reactionSummary.likesCount,
    dislikesCount: reactionSummary.dislikesCount,
    reactionCounts: reactionSummary.reactionCounts,
    myReaction: reactionSummary.myReaction,
    authorMute: authorMute
      ? {
          id: authorMute.id,
          kind: authorMute.kind,
          expiresAt: authorMute.expiresAt?.toISOString() ?? null
        }
      : null,
    pinnedAt: message.pinnedAt?.toISOString() ?? null,
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
      username: null,
      photoUrl: null
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

async function ensureCommunityAccess(
  c: Context<{ Variables: AuthVariables }>,
  role: Awaited<ReturnType<typeof getUserRole>>
) {
  const previewMembershipStatus = c.get("previewMembershipStatus");
  if (previewMembershipStatus === "active") {
    return null;
  }

  if (previewMembershipStatus === "inactive") {
    return c.json({ error: "Active membership is required", membershipStatus: "inactive" }, 403);
  }

  if (role !== "member") {
    return null;
  }

  const membership = await getMembership(c.get("userId"));
  if (!membership.isActive) {
    return c.json({ error: "Active membership is required", membershipStatus: membership.status }, 403);
  }

  return null;
}

async function getCommunityRole(c: Context<{ Variables: AuthVariables }>) {
  const previewRole = c.get("previewRole");
  if (previewRole) {
    return previewRole;
  }

  const telegramId = c.get("telegramUser").id;
  const role = await getUserRole(telegramId);
  if (role !== "admin") {
    return role;
  }

  return (await isOwnerTelegramId(telegramId)) || (await hasAdminPermission(telegramId, "community")) ? "admin" : "member";
}

async function purgeExpiredDeletedMessages(now = new Date()) {
  await db
    .delete(clubChatMessages)
    .where(and(eq(clubChatMessages.status, "deleted"), lte(clubChatMessages.purgeAt, now)));
}

async function notifyReplyRecipient({
  topic,
  replyToMessage,
  sender,
  body
}: {
  topic: typeof clubChatTopics.$inferSelect;
  replyToMessage: typeof clubChatMessages.$inferSelect & {
    user: {
      id: string;
      telegramId: string;
      firstName: string | null;
      username: string | null;
      photoUrl: string | null;
      avatarPositionX?: number | null;
      avatarPositionY?: number | null;
      avatarScale?: number | null;
    };
  };
  sender: {
    id: string;
    telegramId: string;
    firstName: string | null;
    username: string | null;
    photoUrl: string | null;
    avatarPositionX?: number | null;
    avatarPositionY?: number | null;
    avatarScale?: number | null;
  };
  body: string;
}) {
  if (replyToMessage.userId === sender.id) {
    return;
  }

  await createAppNotification({
    userId: replyToMessage.user.id,
    kind: "client",
    title: `Ответ в чате: ${topic.title}`,
    body: formatReplyNotificationText({
      senderName: userName(sender),
      topicTitle: topic.title,
      body
    }),
    source: "community_reply",
    sourceId: topic.id
  });
}

export const communityRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .get("/topics", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) {
      return accessError;
    }

    return c.json({
      topics: await listCommunityTopics(role, c.get("userId"))
    });
  })
  .post("/topics", async (c) => {
    const role = await getCommunityRole(c);
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
      topic: await serializeTopic(topic, c.get("userId"))
    });
  })
  .get("/chats", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) {
      return accessError;
    }

    const chats = await db.query.clubChats.findMany({
      where: eq(clubChats.isPublished, true),
      orderBy: (table, { asc }) => [asc(table.sortOrder), asc(table.createdAt)]
    });

    return c.json({
      chats: await Promise.all(chats.map(serializeChat))
    });
  })
  .post("/chats", async (c) => {
    const role = await getCommunityRole(c);
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
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) {
      return accessError;
    }

    const chat = await db.query.clubChats.findFirst({
      where: and(eq(clubChats.id, c.req.param("id")), eq(clubChats.isPublished, true))
    });

    if (!chat) {
      return c.json({ error: "Chat not found" }, 404);
    }

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
      topics: await Promise.all(topics.map((topic) => serializeTopic(topic, c.get("userId"))))
    });
  })
  .post("/chats/:id/topics", async (c) => {
    const role = await getCommunityRole(c);
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
      topic: await serializeTopic(topic, c.get("userId"))
    });
  })
  .post("/topics/:id/settings", async (c) => {
    const role = await getCommunityRole(c);
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
      topic: await serializeTopic(topic, c.get("userId"))
    });
  })
  .get("/topics/:id/messages", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) {
      return accessError;
    }

    await purgeExpiredDeletedMessages();

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
      limit: 500,
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
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) {
      return accessError;
    }

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

    if (topic.isLocked && role === "member") {
      return c.json({ error: "Topic is locked" }, 403);
    }

    const replyToMessage = body.data.replyToMessageId
      ? await db.query.clubChatMessages.findFirst({
        where: and(eq(clubChatMessages.id, body.data.replyToMessageId), eq(clubChatMessages.topicId, topic.id)),
        with: {
          user: true
        }
      })
      : null;

    if (body.data.replyToMessageId) {
      if (!replyToMessage) {
        return c.json({ error: "Reply message not found" }, 404);
      }

      if (replyToMessage.isSystem) {
        return c.json({ error: "Cannot reply to system message" }, 400);
      }
    }

    const sender = await db.query.users.findFirst({
      where: eq(users.id, c.get("userId"))
    });

    if (!sender) {
      return c.json({ error: "Unable to resolve sender" }, 500);
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

    if (replyToMessage) {
      notifyReplyRecipient({
        topic,
        replyToMessage,
        sender,
        body: body.data.body
      }).catch((error: unknown) => {
        logger.warn({ error, messageId: message.id }, "reply notification failed");
      });
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
  .post("/topics/:id/messages/voice", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) return accessError;
    const mute = await getActiveMute(c.get("userId"));
    if (mute) return c.json({ error: "User is muted", ...serializeMute(mute) }, 403);
    const topic = await db.query.clubChatTopics.findFirst({ where: eq(clubChatTopics.id, c.req.param("id")) });
    if (!topic) return c.json({ error: "Topic not found" }, 404);
    if (topic.isLocked && role === "member") return c.json({ error: "Topic is locked" }, 403);

    const form = await c.req.formData();
    const file = form.get("voice");
    const durationSeconds = Number(form.get("durationSeconds"));
    const replyToMessageId = String(form.get("replyToMessageId") ?? "").trim() || null;
    if (!(file instanceof File) || file.size > communityVoiceMaxBytes || !Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 300) {
      return c.json({ error: "Invalid voice message" }, 400);
    }
    const contentType = getCommunityVoiceContentType(file.type, file.name);
    if (!contentType) return c.json({ error: "Unsupported voice format" }, 415);
    if (replyToMessageId) {
      const reply = await db.query.clubChatMessages.findFirst({ where: and(eq(clubChatMessages.id, replyToMessageId), eq(clubChatMessages.topicId, topic.id)) });
      if (!reply || reply.isSystem) return c.json({ error: "Reply message not found" }, 404);
    }

    const [message] = await db.insert(clubChatMessages).values({
      topicId: topic.id,
      userId: c.get("userId"),
      replyToMessageId,
      body: "Голосовое сообщение",
      kind: "voice"
    }).returning();
    if (!message) return c.json({ error: "Unable to create message" }, 500);

    const attachmentId = randomUUID();
    const key = buildCommunityMediaObjectKey("voice", message.id, attachmentId, file.name || "voice.webm");
    try {
      await uploadObject({ key, body: new Uint8Array(await file.arrayBuffer()), contentType });
      await db.insert(clubMessageAttachments).values({
        id: attachmentId,
        messageId: message.id,
        kind: "voice",
        objectKey: key,
        contentType,
        sizeBytes: file.size,
        durationSeconds: Math.round(durationSeconds),
        expiresAt: getCommunityMediaExpiry(role)
      });
    } catch (error) {
      await deleteObject(key).catch(() => undefined);
      await db.delete(clubChatMessages).where(eq(clubChatMessages.id, message.id));
      logger.warn({ error, messageId: message.id }, "voice message upload failed");
      return c.json({ error: "Unable to upload voice message" }, 500);
    }
    const created = await findMessageWithUser(message.id);
    return c.json({ ok: true, message: await serializeMessage(created!, c.get("userId")) });
  })
  .post("/topics/:id/messages/images", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) return accessError;
    const mute = await getActiveMute(c.get("userId"));
    if (mute) return c.json({ error: "User is muted", ...serializeMute(mute) }, 403);
    const topic = await db.query.clubChatTopics.findFirst({ where: eq(clubChatTopics.id, c.req.param("id")) });
    if (!topic) return c.json({ error: "Topic not found" }, 404);
    if (topic.isLocked && role === "member") return c.json({ error: "Topic is locked" }, 403);

    const form = await c.req.formData();
    const files = form.getAll("images").filter((entry): entry is File => entry instanceof File);
    const replyToMessageId = String(form.get("replyToMessageId") ?? "").trim() || null;
    const validationError = validateCommunityImageFiles(files);
    if (validationError) return c.json({ error: validationError }, 400);
    if (replyToMessageId) {
      const reply = await db.query.clubChatMessages.findFirst({ where: and(eq(clubChatMessages.id, replyToMessageId), eq(clubChatMessages.topicId, topic.id)) });
      if (!reply || reply.isSystem) return c.json({ error: "Reply message not found" }, 404);
    }
    let prepared: Awaited<ReturnType<typeof prepareCommunityImage>>[];
    try {
      prepared = await Promise.all(files.map(prepareCommunityImage));
    } catch {
      return c.json({ error: "Не удалось обработать изображение." }, 415);
    }

    const [message] = await db.insert(clubChatMessages).values({
      topicId: topic.id,
      userId: c.get("userId"),
      replyToMessageId,
      body: files.length === 1 ? "Изображение" : `${files.length} изображений`,
      kind: "images"
    }).returning();
    if (!message) return c.json({ error: "Unable to create message" }, 500);

    const uploadedKeys: string[] = [];
    try {
      for (const [index, image] of prepared.entries()) {
        const attachmentId = randomUUID();
        const key = buildCommunityMediaObjectKey("image", message.id, attachmentId, image.fileName);
        await uploadObject({ key, body: image.body, contentType: image.contentType });
        uploadedKeys.push(key);
        await db.insert(clubMessageAttachments).values({
          id: attachmentId,
          messageId: message.id,
          kind: "image",
          objectKey: key,
          contentType: image.contentType,
          sizeBytes: image.sizeBytes,
          width: image.width,
          height: image.height,
          sortOrder: index,
          expiresAt: getCommunityMediaExpiry(role)
        });
      }
    } catch (error) {
      for (const key of uploadedKeys) await deleteObject(key).catch(() => undefined);
      await db.delete(clubChatMessages).where(eq(clubChatMessages.id, message.id));
      logger.warn({ error, messageId: message.id }, "image message upload failed");
      return c.json({ error: "Unable to upload images" }, 500);
    }
    const created = await findMessageWithUser(message.id);
    return c.json({ ok: true, message: await serializeMessage(created!, c.get("userId")) });
  })
  .post("/topics/:id/messages/poll", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) return accessError;
    const mute = await getActiveMute(c.get("userId"));
    if (mute) return c.json({ error: "User is muted", ...serializeMute(mute) }, 403);
    const topic = await db.query.clubChatTopics.findFirst({ where: eq(clubChatTopics.id, c.req.param("id")) });
    if (!topic) return c.json({ error: "Topic not found" }, 404);
    if (topic.isLocked && role === "member") return c.json({ error: "Topic is locked" }, 403);
    const parsed = pollPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid poll" }, 400);
    let draft: ReturnType<typeof normalizePollDraft>;
    try {
      draft = normalizePollDraft({ ...parsed.data, closesAt: parsed.data.closesAt ?? null });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid poll" }, 400);
    }
    if (parsed.data.replyToMessageId) {
      const reply = await db.query.clubChatMessages.findFirst({ where: and(eq(clubChatMessages.id, parsed.data.replyToMessageId), eq(clubChatMessages.topicId, topic.id)) });
      if (!reply || reply.isSystem) return c.json({ error: "Reply message not found" }, 404);
    }

    const messageId = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(clubChatMessages).values({
        id: messageId,
        topicId: topic.id,
        userId: c.get("userId"),
        replyToMessageId: parsed.data.replyToMessageId ?? null,
        body: draft.question,
        kind: "poll"
      });
      const [poll] = await tx.insert(clubPolls).values({
        messageId,
        question: draft.question,
        allowsMultiple: draft.allowsMultiple,
        isAnonymous: draft.isAnonymous,
        closesAt: draft.closesAt
      }).returning();
      if (!poll) throw new Error("Unable to create poll");
      await tx.insert(clubPollOptions).values(draft.options.map((text, sortOrder) => ({ pollId: poll.id, text, sortOrder })));
    });
    const created = await findMessageWithUser(messageId);
    return c.json({ ok: true, message: await serializeMessage(created!, c.get("userId")) });
  })
  .post("/polls/:id/votes", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) return accessError;
    const mute = await getActiveMute(c.get("userId"));
    if (mute) return c.json({ error: "User is muted", ...serializeMute(mute) }, 403);
    const parsed = pollVotePayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid vote" }, 400);
    const poll = await db.query.clubPolls.findFirst({ where: eq(clubPolls.id, c.req.param("id")), with: { options: true, message: { with: { topic: true } } } });
    if (!poll) return c.json({ error: "Poll not found" }, 404);
    if (role === "member" && (!poll.message.topic.isPublished || poll.message.topic.isLocked)) return c.json({ error: "Topic is unavailable" }, 403);
    if (poll.closedAt || (poll.closesAt && poll.closesAt <= new Date())) return c.json({ error: "Poll is closed" }, 409);
    let optionIds: string[];
    try {
      optionIds = validatePollSelection(parsed.data.optionIds, poll.options.map((option) => option.id), poll.allowsMultiple);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Invalid vote" }, 400);
    }
    await db.transaction(async (tx) => {
      await tx.delete(clubPollVotes).where(and(eq(clubPollVotes.pollId, poll.id), eq(clubPollVotes.userId, c.get("userId"))));
      await tx.insert(clubPollVotes).values(optionIds.map((optionId) => ({ pollId: poll.id, optionId, userId: c.get("userId") })));
    });
    const message = await findMessageWithUser(poll.messageId);
    return c.json({ ok: true, message: await serializeMessage(message!, c.get("userId")) });
  })
  .post("/polls/:id/close", async (c) => {
    const role = await getCommunityRole(c);
    if (role === "member") return c.json({ error: "Moderator access required" }, 403);
    const [poll] = await db.update(clubPolls).set({ closedAt: new Date() }).where(eq(clubPolls.id, c.req.param("id"))).returning();
    if (!poll) return c.json({ error: "Poll not found" }, 404);
    const message = await findMessageWithUser(poll.messageId);
    return c.json({ ok: true, message: await serializeMessage(message!, c.get("userId")) });
  })
  .post("/messages/:id/pin", async (c) => {
    const role = await getCommunityRole(c);
    if (role === "member") {
      return c.json({ error: "Moderator access required" }, 403);
    }

    const payload = z.object({ pinned: z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!payload.success) {
      return c.json({ error: "Invalid pin state" }, 400);
    }

    const current = await db.query.clubChatMessages.findFirst({
      where: eq(clubChatMessages.id, c.req.param("id")),
      with: { user: true }
    });
    if (!current) {
      return c.json({ error: "Message not found" }, 404);
    }
    if (current.status !== "visible" || current.isSystem) {
      return c.json({ error: "Only visible user messages can be pinned" }, 400);
    }

    if (payload.data.pinned && !current.pinnedAt) {
      const [row] = await db
        .select({ value: count(clubChatMessages.id) })
        .from(clubChatMessages)
        .where(
          and(
            eq(clubChatMessages.topicId, current.topicId),
            eq(clubChatMessages.status, "visible"),
            gt(clubChatMessages.pinnedAt, new Date(0))
          )
        );
      if ((row?.value ?? 0) >= 5) {
        return c.json({ error: "Pinned messages limit reached" }, 409);
      }
    }

    await db
      .update(clubChatMessages)
      .set({
        pinnedAt: payload.data.pinned ? new Date() : null,
        pinnedByUserId: payload.data.pinned ? c.get("userId") : null,
        updatedAt: new Date()
      })
      .where(eq(clubChatMessages.id, current.id));

    const updated = await db.query.clubChatMessages.findFirst({
      where: eq(clubChatMessages.id, current.id),
      with: { user: true }
    });
    if (!updated) {
      return c.json({ error: "Message not found" }, 404);
    }

    return c.json({ ok: true, message: await serializeMessage(updated, c.get("userId")) });
  })
  .post("/topics/:id/messages/delete-all", async (c) => {
    const role = await getCommunityRole(c);
    if (role === "member") {
      return c.json({ error: "Moderator access required" }, 403);
    }

    const topic = await db.query.clubChatTopics.findFirst({
      where: eq(clubChatTopics.id, c.req.param("id"))
    });

    if (!topic) {
      return c.json({ error: "Topic not found" }, 404);
    }

    await purgeExpiredDeletedMessages();

    if (shouldHardDeleteMessages(role)) {
      await db.delete(clubChatMessages).where(eq(clubChatMessages.topicId, topic.id));
    } else {
      const now = new Date();
      await db
        .update(clubChatMessages)
        .set({
          status: "deleted",
          moderatedByUserId: c.get("userId"),
          moderatedAt: now,
          moderationReason: "Bulk topic cleanup",
          purgeAt: getMessagePurgeAt("topic", role, now),
          pinnedAt: null,
          pinnedByUserId: null,
          updatedAt: now
        })
        .where(eq(clubChatMessages.topicId, topic.id));
    }

    return c.json({ ok: true });
  })
  .post("/topics/:id/messages/delete-author", async (c) => {
    const role = await getCommunityRole(c);
    if (role === "member") {
      return c.json({ error: "Moderator access required" }, 403);
    }

    const body = deleteAuthorMessagesPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid author payload" }, 400);
    }

    const topic = await db.query.clubChatTopics.findFirst({
      where: eq(clubChatTopics.id, c.req.param("id"))
    });
    if (!topic) {
      return c.json({ error: "Topic not found" }, 404);
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.telegramId, body.data.telegramId)
    });
    if (!targetUser) {
      return c.json({ error: "User not found" }, 404);
    }

    await purgeExpiredDeletedMessages();

    const filter = and(
      eq(clubChatMessages.topicId, topic.id),
      eq(clubChatMessages.userId, targetUser.id),
      eq(clubChatMessages.isSystem, false)
    );

    if (shouldHardDeleteMessages(role)) {
      await db.delete(clubChatMessages).where(filter);
    } else {
      const now = new Date();
      await db
        .update(clubChatMessages)
        .set({
          status: "deleted",
          moderatedByUserId: c.get("userId"),
          moderatedAt: now,
          moderationReason: "Bulk author cleanup",
          purgeAt: getMessagePurgeAt("message", role, now),
          pinnedAt: null,
          pinnedByUserId: null,
          updatedAt: now
        })
        .where(filter);
    }

    return c.json({ ok: true });
  })
  .post("/topics/:id/mutes", async (c) => {
    const role = await getCommunityRole(c);
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

    const activeMute = await getActiveMute(targetUser.id);
    if (activeMute) {
      return c.json({ error: "Active mute already exists" }, 409);
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
    const role = await getCommunityRole(c);
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
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) {
      return accessError;
    }

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
