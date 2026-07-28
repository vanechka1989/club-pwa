import { and, count, desc, eq, gt, inArray, lt, lte, max, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE, type SSEMessage } from "hono/streaming";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  communityMentionSchema,
  communityMessageEditRequestSchema,
  communityMessageSearchQuerySchema,
  communityParticipantSuggestionsQuerySchema,
  communityTopicNotificationSettingsRequestSchema,
  communityTopicReadPositionRequestSchema,
  type ClubChat,
  type ClubMessage,
  type ClubTopic,
  type CommunityAttachmentScanStatus,
  type UserRole
} from "@club/shared";
import { getUserRole, hasAdminPermission, isOwnerTelegramId } from "../admin/roles";
import { getMessagePurgeAt, shouldHardDeleteMessages } from "../community/messageDeletion";
import { buildMessageAuthor, buildReplyPreview, getMessageContentView, summarizeReactions } from "../community/messageMetadata";
import { MessageMutationError, messageMutationService } from "../community/messageMutationService";
import { decodeSearchCursor, loadMessageContext, loadSafeReplyMessage, searchCommunityMessages } from "../community/messageSearch";
import { formatMuteDuration, formatMuteSystemMessage, formatUnmuteSystemMessage } from "../community/muteNotice";
import { getArchiveExpirationDate } from "../community/topicArchive";
import { isTopicAccessibleForRole } from "../community/topicAccess";
import { topicStateRepository } from "../community/topicStateRepository";
import { getCommunityMediaExpiry } from "../community/mediaPolicy";
import { buildCommunityMediaObjectKey, communityVoiceMaxBytes, getCommunityVoiceContentType, prepareCommunityImage, prepareCommunityVoice, validateCommunityImageFiles } from "../community/mediaUpload";
import { normalizePollDraft, validatePollSelection } from "../community/polls";
import { publishCommunityChange, subscribeToCommunityChanges } from "../community/realtime";
import { db } from "../db/client";
import { clubChatMessages, clubChatTopics, clubChats, clubMessageAttachments, clubMessageMentions, clubMessageReactions, clubPollOptions, clubPolls, clubPollVotes, userMutes, users } from "../db/schema";
import { logger } from "../logger";
import { getMembership } from "../membership/getMembership";
import { getActiveMute } from "../moderation/mutes";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { persistentWriteRateLimit } from "../security/persistentWriteRateLimit";
import { persistentCommunityReadRateLimit } from "../security/persistentCommunityReadRateLimit";
import { deleteObject, getObjectReadUrl, uploadObject } from "../storage/s3";

const chatPayloadSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).nullable().optional()
});
const messagePageQuerySchema = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(20).max(100).default(50)
});
const messageContextQuerySchema = z.object({
  before: z.coerce.number().int().min(0).max(50).default(20),
  after: z.coerce.number().int().min(0).max(50).default(20)
});
const messageContextPathSchema = z.object({
  topicId: z.string().uuid(),
  messageId: z.string().uuid()
}).strict();

const topicPayloadSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1000).nullable().optional(),
  isAdminOnly: z.boolean().default(false)
});

const messagePayloadSchema = z.object({
  body: z.string().trim().min(1).max(3000),
  replyToMessageId: z.string().uuid().nullable().default(null),
  clientOperationId: z.string().trim().min(1).max(96),
  mentions: z.array(communityMentionSchema).default([])
}).strict();

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
const communityMutationMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const realtimeTopicHeader = "x-club-community-realtime-topic";
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

async function serializeChat(chat: typeof clubChats.$inferSelect, role: UserRole): Promise<ClubChat> {
  const [topicsRow] = await db
    .select({ value: count(clubChatTopics.id) })
    .from(clubChatTopics)
    .where(role === "member" ? memberVisibleTopicCondition(chat.id) : eq(clubChatTopics.chatId, chat.id));

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
        ? memberVisibleTopicCondition(chat.id)
        : and(
            eq(clubChatTopics.chatId, chat.id),
            or(eq(clubChatTopics.isPublished, true), gt(clubChatTopics.archivedUntil, new Date()))
          ),
    orderBy: [desc(clubChatTopics.isPinned), desc(clubChatTopics.createdAt)]
  });

  return serializeTopics(topics, currentUserId);
}

function memberVisibleTopicCondition(chatId: string) {
  return and(
    eq(clubChatTopics.chatId, chatId),
    eq(clubChatTopics.isPublished, true),
    eq(clubChatTopics.isAdminOnly, false)
  );
}

async function serializeTopics(topics: Array<typeof clubChatTopics.$inferSelect>, currentUserId: string): Promise<ClubTopic[]> {
  if (!topics.length) {
    return [];
  }

  const topicIds = topics.map((topic) => topic.id);
  const originalMessage = alias(clubChatMessages, "original_message");
  const [messageCounts, latestReplies, topicStates] = await Promise.all([
    db
      .select({ topicId: clubChatMessages.topicId, value: count(clubChatMessages.id) })
      .from(clubChatMessages)
      .where(and(inArray(clubChatMessages.topicId, topicIds), eq(clubChatMessages.status, "visible")))
      .groupBy(clubChatMessages.topicId),
    db
      .select({ topicId: clubChatMessages.topicId, createdAt: max(clubChatMessages.createdAt) })
      .from(clubChatMessages)
      .innerJoin(originalMessage, eq(clubChatMessages.replyToMessageId, originalMessage.id))
      .where(
        and(
          inArray(clubChatMessages.topicId, topicIds),
          eq(clubChatMessages.status, "visible"),
          eq(originalMessage.userId, currentUserId),
          ne(clubChatMessages.userId, currentUserId)
        )
      )
      .groupBy(clubChatMessages.topicId),
    topicStateRepository.getStates(currentUserId, topicIds)
  ]);
  const countsByTopic = new Map(messageCounts.map((row) => [row.topicId, row.value]));
  const repliesByTopic = new Map(latestReplies.map((row) => [row.topicId, row.createdAt]));

  return topics.map((topic) => ({
    id: topic.id,
    chatId: topic.chatId,
    title: topic.title,
    description: topic.description,
    isPinned: topic.isPinned,
    isLocked: topic.isLocked,
    isPublished: topic.isPublished,
    isAdminOnly: topic.isAdminOnly,
    archivedUntil: topic.archivedUntil?.toISOString() ?? null,
    messagesCount: countsByTopic.get(topic.id) ?? 0,
    latestReplyToMeAt: repliesByTopic.get(topic.id)?.toISOString() ?? null,
    unreadCount: topicStates.get(topic.id)?.unreadCount ?? 0,
    notificationMode: topicStates.get(topic.id)?.notificationMode ?? "mentions",
    createdAt: topic.createdAt.toISOString()
  }));
}

async function serializeTopic(topic: typeof clubChatTopics.$inferSelect, currentUserId: string): Promise<ClubTopic> {
  const [serialized] = await serializeTopics([topic], currentUserId);
  return serialized!;
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
  currentUserId: string,
  role: UserRole,
  safeReplyPreview = false
): Promise<ClubMessage> {
  const content = getMessageContentView(message, role);
  const reactions = content.revealContent
    ? await db.query.clubMessageReactions.findMany({
        where: eq(clubMessageReactions.messageId, message.id)
      })
    : [];
  const replyTo = !content.revealContent || !message.replyToMessageId
    ? null
    : safeReplyPreview
      ? await loadSafeReplyMessage({ topicId: message.topicId, messageId: message.replyToMessageId })
      : await db.query.clubChatMessages.findFirst({
          where: eq(clubChatMessages.id, message.replyToMessageId),
          with: { user: true }
        });
  const reactionSummary = summarizeReactions(reactions, currentUserId);
  const authorMute = await getActiveMute(message.user.id);
  const attachments = content.revealContent
    ? await db.query.clubMessageAttachments.findMany({
        where: eq(clubMessageAttachments.messageId, message.id),
        orderBy: (table, { asc }) => [asc(table.sortOrder)]
      })
    : [];
  const kind = content.revealContent ? ((message.kind as ClubMessage["kind"]) ?? "text") : "text";
  const attachmentStatuses = new Set<CommunityAttachmentScanStatus>([
    "pending",
    "scanning",
    "ready",
    "rejected",
    "failed",
    "deleted"
  ]);
  const serializedAttachments = await Promise.all(
    attachments.map(async (attachment) => {
      const persistedStatus = attachment.scanStatus as CommunityAttachmentScanStatus;
      const scanStatus: CommunityAttachmentScanStatus = attachment.deletedAt
        ? "deleted"
        : attachmentStatuses.has(persistedStatus)
          ? persistedStatus
          : "failed";
      return {
        ...attachment,
        scanStatus,
        url: scanStatus === "ready" ? await getObjectReadUrl(attachment.objectKey) : null
      };
    })
  );
  const voiceAttachment = kind === "voice" ? serializedAttachments[0] : undefined;
  const imageAttachments = kind === "images" ? serializedAttachments : [];
  const videoAttachment = kind === "video" ? serializedAttachments[0] : undefined;
  const documentAttachment = kind === "document" ? serializedAttachments[0] : undefined;
  const pollRecord = content.revealContent && kind === "poll"
    ? await db.query.clubPolls.findFirst({
        where: eq(clubPolls.messageId, message.id),
        with: { options: true, votes: true }
      })
    : null;
  const pollVoterIds = new Set(pollRecord?.votes.map((vote) => vote.userId) ?? []);

  const mentionRows = content.revealContent
    ? await db.query.clubMessageMentions.findMany({
        where: eq(clubMessageMentions.messageId, message.id),
        with: { user: true }
      })
    : [];
  const replyContent = replyTo ? getMessageContentView(replyTo, role) : null;

  return {
    id: message.id,
    topicId: message.topicId,
    body: content.body,
    kind,
    voice: voiceAttachment
      ? {
          id: voiceAttachment.id,
          url: voiceAttachment.url,
          fileName: voiceAttachment.fileName,
          contentType: voiceAttachment.contentType,
          sizeBytes: voiceAttachment.sizeBytes,
          durationSeconds: voiceAttachment.durationSeconds ?? 0,
          expiresAt: voiceAttachment.expiresAt?.toISOString() ?? null,
          deletedAt: voiceAttachment.deletedAt?.toISOString() ?? null,
          scanStatus: voiceAttachment.scanStatus,
          scannedAt: voiceAttachment.scannedAt?.toISOString() ?? null,
          scanError: voiceAttachment.scanError
        }
      : null,
    images: imageAttachments.map((attachment) => ({
      id: attachment.id,
      url: attachment.url,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      width: attachment.width ?? 1,
      height: attachment.height ?? 1,
      expiresAt: attachment.expiresAt?.toISOString() ?? null,
      deletedAt: attachment.deletedAt?.toISOString() ?? null,
      scanStatus: attachment.scanStatus,
      scannedAt: attachment.scannedAt?.toISOString() ?? null,
      scanError: attachment.scanError
    })),
    video: videoAttachment
      ? {
          id: videoAttachment.id,
          url: videoAttachment.url,
          fileName: videoAttachment.fileName,
          contentType: videoAttachment.contentType,
          sizeBytes: videoAttachment.sizeBytes,
          width: videoAttachment.width ?? 1,
          height: videoAttachment.height ?? 1,
          durationSeconds: videoAttachment.durationSeconds ?? 0,
          expiresAt: videoAttachment.expiresAt?.toISOString() ?? null,
          deletedAt: videoAttachment.deletedAt?.toISOString() ?? null,
          scanStatus: videoAttachment.scanStatus,
          scannedAt: videoAttachment.scannedAt?.toISOString() ?? null,
          scanError: videoAttachment.scanError
        }
      : null,
    document: documentAttachment
      ? {
          id: documentAttachment.id,
          url: documentAttachment.url,
          fileName: documentAttachment.fileName ?? "document",
          contentType: documentAttachment.contentType,
          sizeBytes: documentAttachment.sizeBytes,
          expiresAt: documentAttachment.expiresAt?.toISOString() ?? null,
          deletedAt: documentAttachment.deletedAt?.toISOString() ?? null,
          scanStatus: documentAttachment.scanStatus,
          scannedAt: documentAttachment.scannedAt?.toISOString() ?? null,
          scanError: documentAttachment.scanError
        }
      : null,
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
    replyTo: buildReplyPreview(replyTo ?? null, replyContent?.body),
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
    editedAt: content.revealContent ? message.editedAt?.toISOString() ?? null : null,
    deletedByUserAt: message.deletedByUserAt?.toISOString() ?? null,
    clientOperationId: content.revealContent ? message.clientOperationId : null,
    mentions: mentionRows.map((mention) => ({
      userId: mention.userId,
      displayName: userName(mention.user),
      start: mention.startOffset,
      end: mention.endOffset
    })),
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

function userName(user: { telegramId: string; firstName: string | null; username: string | null; displayName?: string | null }) {
  return user.displayName || user.firstName || user.username || `ID ${user.telegramId}`;
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
  return getCommunityRoleByTelegramId(telegramId);
}

async function getCommunityRoleByTelegramId(telegramId: string): Promise<UserRole> {
  const role = await getUserRole(telegramId);
  if (role !== "admin") {
    return role;
  }

  return (await isOwnerTelegramId(telegramId)) || (await hasAdminPermission(telegramId, "community")) ? "admin" : "member";
}

async function getAccessibleTopic(topicId: string, role: UserRole) {
  const topic = await db.query.clubChatTopics.findFirst({
    where: eq(clubChatTopics.id, topicId)
  });

  return topic && isTopicAccessibleForRole(topic, role) ? topic : null;
}

async function canReceiveCommunityEvent(
  event: { topicId: string | null },
  telegramId: string,
  previewRole?: UserRole | null
) {
  const role = previewRole ?? await getCommunityRoleByTelegramId(telegramId);
  if (role !== "member" || !event.topicId) {
    return true;
  }

  const topic = await db.query.clubChatTopics.findFirst({
    where: eq(clubChatTopics.id, event.topicId)
  });

  return Boolean(topic && isTopicAccessibleForRole(topic, role));
}

async function purgeExpiredDeletedMessages(now = new Date()) {
  await db
    .delete(clubChatMessages)
    .where(and(eq(clubChatMessages.status, "deleted"), lte(clubChatMessages.purgeAt, now)));
}

function mutationErrorResponse(c: Context, error: unknown) {
  if (error instanceof MessageMutationError) {
    return c.json({ error: error.message, code: error.code }, error.status);
  }
  throw error;
}

async function validateLockedReply(
  database: typeof db,
  replyToMessageId: string | null,
  topicId: string
) {
  if (!replyToMessageId) return null;
  await database.execute(sql`
    select id
    from club_chat_messages
    where id = ${replyToMessageId} and topic_id = ${topicId}
    for share
  `);
  const reply = await database.query.clubChatMessages.findFirst({
    where: and(eq(clubChatMessages.id, replyToMessageId), eq(clubChatMessages.topicId, topicId))
  });
  if (!reply) return { error: "Reply message not found", status: 404 as const };
  if (reply.isSystem || reply.status !== "visible" || reply.deletedByUserAt) {
    return { error: "Reply message is unavailable", status: 400 as const };
  }
  return null;
}

export const communityRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .use("*", persistentWriteRateLimit)
  .use("/messages/search", async (c, next) => {
    const query = communityMessageSearchQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: "Invalid message search" }, 400);
    }
    if (query.data.before && !decodeSearchCursor(query.data.before)) {
      return c.json({ error: "Invalid message search cursor" }, 400);
    }
    await next();
  })
  .use("/topics/:topicId/messages/:messageId/context", async (c, next) => {
    if (!messageContextPathSchema.safeParse(c.req.param()).success) {
      return c.json({ error: "Invalid message context path" }, 400);
    }
    if (!messageContextQuerySchema.safeParse(c.req.query()).success) {
      return c.json({ error: "Invalid message context" }, 400);
    }
    await next();
  })
  .use("*", persistentCommunityReadRateLimit)
  .use("*", async (c, next) => {
    await next();

    const explicitTopicId = c.res.headers.get(realtimeTopicHeader);
    c.res.headers.delete(realtimeTopicHeader);
    if (communityMutationMethods.has(c.req.method) && c.res.status < 400) {
      if (explicitTopicId === "skip") return;
      const topicMatch = c.req.path.match(/\/topics\/([^/]+)/);
      publishCommunityChange(
        explicitTopicId ?? (topicMatch?.[1] ? decodeURIComponent(topicMatch[1]) : null)
      );
    }
  })
  .get("/events", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) {
      return accessError;
    }

    c.header("Cache-Control", "no-cache, no-transform");
    c.header("X-Accel-Buffering", "no");
    const telegramId = c.get("telegramUser").id;
    const previewRole = c.get("previewRole");

    return streamSSE(c, async (stream) => {
      let active = true;
      let writeQueue = Promise.resolve();

      const enqueue = (message: SSEMessage) => {
        writeQueue = writeQueue
          .then(async () => {
            if (active && !stream.aborted) {
              await stream.writeSSE(message);
            }
          })
          .catch(() => {
            active = false;
          });
        return writeQueue;
      };

      const unsubscribe = subscribeToCommunityChanges((event) => {
        void (async () => {
          if (!(await canReceiveCommunityEvent(event, telegramId, previewRole))) {
            return;
          }

          await enqueue({
            id: event.id,
            event: "community.changed",
            data: JSON.stringify(event)
          });
        })().catch((error) => {
          logger.warn({ error, telegramId }, "community realtime access check failed");
        });
      });

      stream.onAbort(() => {
        active = false;
        unsubscribe();
      });

      try {
        await enqueue({
          event: "ready",
          retry: 2_000,
          data: JSON.stringify({ connectedAt: new Date().toISOString() })
        });

        while (active && !stream.aborted) {
          await stream.sleep(25_000);
          if (active && !stream.aborted) {
            await enqueue({ event: "heartbeat", data: "{}" });
          }
        }
      } finally {
        active = false;
        unsubscribe();
      }
    });
  })
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
        isAdminOnly: body.data.isAdminOnly,
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
      chats: await Promise.all(chats.map((chat) => serializeChat(chat, role)))
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
      chat: await serializeChat(chat, role)
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
          ? memberVisibleTopicCondition(chat.id)
          : and(
              eq(clubChatTopics.chatId, chat.id),
              or(eq(clubChatTopics.isPublished, true), gt(clubChatTopics.archivedUntil, new Date()))
            ),
      orderBy: [desc(clubChatTopics.isPinned), desc(clubChatTopics.createdAt)]
    });

    return c.json({
      topics: await serializeTopics(topics, c.get("userId"))
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
        isAdminOnly: body.data.isAdminOnly,
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
  .post("/topics/:id/read", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) {
      return accessError;
    }

    const topic = await getAccessibleTopic(c.req.param("id"), role);
    if (!topic) {
      return c.json({ error: "Topic not found" }, 404);
    }

    const body = communityTopicReadPositionRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid read position" }, 400);
    }

    const lastReadMessageId = await topicStateRepository.markRead({
      userId: c.get("userId"),
      topicId: topic.id,
      messageId: body.data.messageId
    });
    if (!lastReadMessageId) {
      return c.json({ error: "Message does not belong to topic" }, 400);
    }

    return c.json(await topicStateRepository.getState(c.get("userId"), topic.id));
  })
  .put("/topics/:id/notification-settings", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) {
      return accessError;
    }

    const topic = await getAccessibleTopic(c.req.param("id"), role);
    if (!topic) {
      return c.json({ error: "Topic not found" }, 404);
    }

    const body = communityTopicNotificationSettingsRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid notification settings" }, 400);
    }

    await topicStateRepository.setNotificationMode({
      userId: c.get("userId"),
      topicId: topic.id,
      mode: body.data.mode
    });

    return c.json(await topicStateRepository.getState(c.get("userId"), topic.id));
  })
  .get("/participants", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) return accessError;
    const query = communityParticipantSuggestionsQuerySchema.safeParse(c.req.query());
    if (!query.success) return c.json({ error: "Invalid participant search" }, 400);
    return c.json({
      participants: await messageMutationService.findParticipants({
        query: query.data.q,
        limit: query.data.limit
      })
    });
  })
  .get("/messages/search", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) {
      return accessError;
    }

    const query = communityMessageSearchQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: "Invalid message search" }, 400);
    }
    const before = query.data.before ? decodeSearchCursor(query.data.before) : undefined;
    if (query.data.before && !before) {
      return c.json({ error: "Invalid message search cursor" }, 400);
    }

    await purgeExpiredDeletedMessages();
    if (query.data.topicId) {
      const topic = await getAccessibleTopic(query.data.topicId, role);
      if (!topic) {
        return c.json({ error: "Topic not found" }, 404);
      }
    }

    return c.json(
      await searchCommunityMessages({
        query: query.data.q,
        limit: query.data.limit,
        role,
        ...(query.data.topicId ? { topicId: query.data.topicId } : {}),
        ...(before ? { before } : {})
      })
    );
  })
  .get("/topics/:topicId/messages/:messageId/context", async (c) => {
    const path = messageContextPathSchema.safeParse(c.req.param());
    if (!path.success) {
      return c.json({ error: "Invalid message context path" }, 400);
    }
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) {
      return accessError;
    }

    const query = messageContextQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: "Invalid message context" }, 400);
    }

    await purgeExpiredDeletedMessages();
    const topic = await getAccessibleTopic(path.data.topicId, role);
    if (!topic) {
      return c.json({ error: "Topic not found" }, 404);
    }

    const context = await loadMessageContext({
      topicId: topic.id,
      messageId: path.data.messageId,
      before: query.data.before,
      after: query.data.after
    });
    if (!context) {
      return c.json({ error: "Message not found" }, 404);
    }

    return c.json({
      targetMessageId: context.targetMessageId,
      messages: await Promise.all(context.messages.map((message) => serializeMessage(message, c.get("userId"), role, true)))
    });
  })
  .get("/topics/:id/messages", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) {
      return accessError;
    }

    await purgeExpiredDeletedMessages();

    const topic = await getAccessibleTopic(c.req.param("id"), role);

    if (!topic) {
      return c.json({ error: "Topic not found" }, 404);
    }

    const query = messagePageQuerySchema.safeParse(c.req.query());
    if (!query.success) return c.json({ error: "Invalid message page" }, 400);
    const visibilityWhere = role === "member" ? eq(clubChatMessages.status, "visible") : undefined;
    const messages = await db.query.clubChatMessages.findMany({
      where: and(
        eq(clubChatMessages.topicId, topic.id),
        visibilityWhere,
        query.data.before ? lt(clubChatMessages.createdAt, new Date(query.data.before)) : undefined
      ),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: query.data.limit + 1,
      with: {
        user: true
      }
    });
    const hasMore = messages.length > query.data.limit;
    const pageMessages = messages.slice(0, query.data.limit);
    const mute = await getActiveMute(c.get("userId"));

    return c.json({
      messages: await Promise.all(pageMessages.map((message) => serializeMessage(message, c.get("userId"), role))),
      nextCursor: hasMore ? pageMessages.at(-1)?.createdAt.toISOString() ?? null : null,
      ...serializeMute(mute)
    });
  })
  .post("/topics/:id/messages", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) return accessError;
    const mute = await getActiveMute(c.get("userId"));
    if (mute) return c.json({ error: "User is muted", ...serializeMute(mute) }, 403);
    const body = messagePayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Invalid message" }, 400);

    try {
      const result = await messageMutationService.createText({
        topicId: c.req.param("id"),
        userId: c.get("userId"),
        role,
        body: body.data.body,
        replyToMessageId: body.data.replyToMessageId,
        clientOperationId: body.data.clientOperationId,
        mentions: body.data.mentions
      });
      const createdMessage = await findMessageWithUser(result.message.id);
      if (!createdMessage) return c.json({ error: "Unable to load message" }, 500);
      c.header(realtimeTopicHeader, "skip");
      return c.json({
        ok: true,
        message: await serializeMessage(createdMessage, c.get("userId"), role)
      });
    } catch (error) {
      return mutationErrorResponse(c, error);
    }
  })
  .patch("/messages/:id", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) return accessError;
    const body = communityMessageEditRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Invalid message edit" }, 400);
    try {
      const result = await messageMutationService.editText({
        messageId: c.req.param("id"),
        userId: c.get("userId"),
        role,
        body: body.data.body,
        mentions: body.data.mentions
      });
      c.header(realtimeTopicHeader, "skip");
      const updatedMessage = await findMessageWithUser(result.message.id);
      if (!updatedMessage) return c.json({ error: "Unable to load message" }, 500);
      return c.json({ ok: true, message: await serializeMessage(updatedMessage, c.get("userId"), role) });
    } catch (error) {
      return mutationErrorResponse(c, error);
    }
  })
  .delete("/messages/:id", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) return accessError;
    try {
      const result = await messageMutationService.deleteMessage({
        messageId: c.req.param("id"),
        userId: c.get("userId"),
        role
      });
      c.header(realtimeTopicHeader, "skip");
      const deletedMessage = await findMessageWithUser(result.message.id);
      if (!deletedMessage) return c.json({ error: "Unable to load message" }, 500);
      return c.json({ ok: true, message: await serializeMessage(deletedMessage, c.get("userId"), role) });
    } catch (error) {
      return mutationErrorResponse(c, error);
    }
  })
  .post("/topics/:id/messages/voice", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) return accessError;
    const mute = await getActiveMute(c.get("userId"));
    if (mute) return c.json({ error: "User is muted", ...serializeMute(mute) }, 403);
    const topic = await getAccessibleTopic(c.req.param("id"), role);
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
      if (!reply) return c.json({ error: "Reply message not found" }, 404);
      if (reply.isSystem || reply.status !== "visible" || reply.deletedByUserAt) {
        return c.json({ error: "Reply message is unavailable" }, 400);
      }
    }

    let preparedVoice: Awaited<ReturnType<typeof prepareCommunityVoice>>;
    try {
      preparedVoice = await prepareCommunityVoice(file);
    } catch (error) {
      logger.warn({ error, contentType, sizeBytes: file.size }, "voice message conversion failed");
      return c.json({ error: "Unable to prepare voice message" }, 422);
    }

    const voiceInsert = await db.transaction(async (transaction) => {
      const database = transaction as unknown as typeof db;
      const replyError = await validateLockedReply(database, replyToMessageId, topic.id);
      if (replyError) return replyError;
      const [message] = await database.insert(clubChatMessages).values({
        topicId: topic.id,
        userId: c.get("userId"),
        replyToMessageId,
        body: "Голосовое сообщение",
        kind: "voice"
      }).returning();
      return message
        ? { message }
        : { error: "Unable to create message", status: 500 as const };
    });
    if ("error" in voiceInsert) return c.json({ error: voiceInsert.error }, voiceInsert.status);
    const { message } = voiceInsert;

    const attachmentId = randomUUID();
    const key = buildCommunityMediaObjectKey("voice", message.id, attachmentId, preparedVoice.fileName);
    try {
      await uploadObject({ key, body: preparedVoice.body, contentType: preparedVoice.contentType });
      await db.insert(clubMessageAttachments).values({
        id: attachmentId,
        messageId: message.id,
        kind: "voice",
        objectKey: key,
        contentType: preparedVoice.contentType,
        sizeBytes: preparedVoice.body.byteLength,
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
    return c.json({ ok: true, message: await serializeMessage(created!, c.get("userId"), role) });
  })
  .post("/topics/:id/messages/images", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) return accessError;
    const mute = await getActiveMute(c.get("userId"));
    if (mute) return c.json({ error: "User is muted", ...serializeMute(mute) }, 403);
    const topic = await getAccessibleTopic(c.req.param("id"), role);
    if (!topic) return c.json({ error: "Topic not found" }, 404);
    if (topic.isLocked && role === "member") return c.json({ error: "Topic is locked" }, 403);

    const form = await c.req.formData();
    const files = form.getAll("images").filter((entry): entry is File => entry instanceof File);
    const replyToMessageId = String(form.get("replyToMessageId") ?? "").trim() || null;
    const validationError = validateCommunityImageFiles(files);
    if (validationError) return c.json({ error: validationError }, 400);
    if (replyToMessageId) {
      const reply = await db.query.clubChatMessages.findFirst({ where: and(eq(clubChatMessages.id, replyToMessageId), eq(clubChatMessages.topicId, topic.id)) });
      if (!reply) return c.json({ error: "Reply message not found" }, 404);
      if (reply.isSystem || reply.status !== "visible" || reply.deletedByUserAt) {
        return c.json({ error: "Reply message is unavailable" }, 400);
      }
    }
    let prepared: Awaited<ReturnType<typeof prepareCommunityImage>>[];
    try {
      prepared = await Promise.all(files.map(prepareCommunityImage));
    } catch {
      return c.json({ error: "Не удалось обработать изображение." }, 415);
    }

    const imageInsert = await db.transaction(async (transaction) => {
      const database = transaction as unknown as typeof db;
      const replyError = await validateLockedReply(database, replyToMessageId, topic.id);
      if (replyError) return replyError;
      const [message] = await database.insert(clubChatMessages).values({
        topicId: topic.id,
        userId: c.get("userId"),
        replyToMessageId,
        body: files.length === 1 ? "Изображение" : `${files.length} изображений`,
        kind: "images"
      }).returning();
      return message
        ? { message }
        : { error: "Unable to create message", status: 500 as const };
    });
    if ("error" in imageInsert) return c.json({ error: imageInsert.error }, imageInsert.status);
    const { message } = imageInsert;

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
    return c.json({ ok: true, message: await serializeMessage(created!, c.get("userId"), role) });
  })
  .post("/topics/:id/messages/poll", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) return accessError;
    const mute = await getActiveMute(c.get("userId"));
    if (mute) return c.json({ error: "User is muted", ...serializeMute(mute) }, 403);
    const topic = await getAccessibleTopic(c.req.param("id"), role);
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
      if (!reply) return c.json({ error: "Reply message not found" }, 404);
      if (reply.isSystem || reply.status !== "visible" || reply.deletedByUserAt) {
        return c.json({ error: "Reply message is unavailable" }, 400);
      }
    }

    const messageId = randomUUID();
    const pollInsert = await db.transaction(async (transaction) => {
      const database = transaction as unknown as typeof db;
      const replyError = await validateLockedReply(database, parsed.data.replyToMessageId ?? null, topic.id);
      if (replyError) return replyError;
      await database.insert(clubChatMessages).values({
        id: messageId,
        topicId: topic.id,
        userId: c.get("userId"),
        replyToMessageId: parsed.data.replyToMessageId ?? null,
        body: draft.question,
        kind: "poll"
      });
      const [poll] = await database.insert(clubPolls).values({
        messageId,
        question: draft.question,
        allowsMultiple: draft.allowsMultiple,
        isAnonymous: draft.isAnonymous,
        closesAt: draft.closesAt
      }).returning();
      if (!poll) throw new Error("Unable to create poll");
      await database.insert(clubPollOptions).values(draft.options.map((text, sortOrder) => ({ pollId: poll.id, text, sortOrder })));
      return { messageId };
    });
    if ("error" in pollInsert) return c.json({ error: pollInsert.error }, pollInsert.status);
    const created = await findMessageWithUser(messageId);
    return c.json({ ok: true, message: await serializeMessage(created!, c.get("userId"), role) });
  })
  .post("/polls/:id/votes", async (c) => {
    const role = await getCommunityRole(c);
    const accessError = await ensureCommunityAccess(c, role);
    if (accessError) return accessError;
    const mute = await getActiveMute(c.get("userId"));
    if (mute) return c.json({ error: "User is muted", ...serializeMute(mute) }, 403);
    const parsed = pollVotePayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid vote" }, 400);
    const pollId = c.req.param("id");
    const voteResult = await db.transaction(async (transaction) => {
      const database = transaction as unknown as typeof db;
      await database.execute(sql`
        select message.id
        from club_polls poll
        join club_chat_messages message on message.id = poll.message_id
        where poll.id = ${pollId}
        for share of poll, message
      `);
      const poll = await database.query.clubPolls.findFirst({ where: eq(clubPolls.id, pollId), with: { options: true, message: { with: { topic: true } } } });
      if (!poll) return { error: "Poll not found", status: 404 as const };
      if (!isTopicAccessibleForRole(poll.message.topic, role)) return { error: "Poll not found", status: 404 as const };
      if (poll.message.status !== "visible" || poll.message.deletedByUserAt) {
        return { error: "Poll is unavailable", status: 409 as const };
      }
      if (role === "member" && (!poll.message.topic.isPublished || poll.message.topic.isLocked)) {
        return { error: "Topic is unavailable", status: 403 as const };
      }
      if (poll.closedAt || (poll.closesAt && poll.closesAt <= new Date())) {
        return { error: "Poll is closed", status: 409 as const };
      }
      let optionIds: string[];
      try {
        optionIds = validatePollSelection(parsed.data.optionIds, poll.options.map((option) => option.id), poll.allowsMultiple);
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Invalid vote", status: 400 as const };
      }
      await database.delete(clubPollVotes).where(and(eq(clubPollVotes.pollId, poll.id), eq(clubPollVotes.userId, c.get("userId"))));
      await database.insert(clubPollVotes).values(optionIds.map((optionId) => ({ pollId: poll.id, optionId, userId: c.get("userId") })));
      return { messageId: poll.messageId };
    });
    if ("error" in voteResult) return c.json({ error: voteResult.error }, voteResult.status);
    const message = await findMessageWithUser(voteResult.messageId);
    return c.json({ ok: true, message: await serializeMessage(message!, c.get("userId"), role) });
  })
  .post("/polls/:id/close", async (c) => {
    const role = await getCommunityRole(c);
    if (role === "member") return c.json({ error: "Moderator access required" }, 403);
    const [poll] = await db.update(clubPolls).set({ closedAt: new Date() }).where(eq(clubPolls.id, c.req.param("id"))).returning();
    if (!poll) return c.json({ error: "Poll not found" }, 404);
    const message = await findMessageWithUser(poll.messageId);
    return c.json({ ok: true, message: await serializeMessage(message!, c.get("userId"), role) });
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

    const messageId = c.req.param("id");
    const pinResult = await db.transaction(async (transaction) => {
      const database = transaction as unknown as typeof db;
      await database.execute(sql`select id from club_chat_messages where id = ${messageId} for update`);
      const current = await database.query.clubChatMessages.findFirst({
        where: eq(clubChatMessages.id, messageId),
        with: { user: true }
      });
      if (!current) return { error: "Message not found", status: 404 as const };
      if (current.deletedByUserAt) return { error: "Message is unavailable", status: 409 as const };
      if (current.status !== "visible" || current.isSystem) {
        return { error: "Only visible user messages can be pinned", status: 400 as const };
      }

      if (payload.data.pinned && !current.pinnedAt) {
        const [row] = await database
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
          return { error: "Pinned messages limit reached", status: 409 as const };
        }
      }

      const now = new Date();
      await database
        .update(clubChatMessages)
        .set({
          pinnedAt: payload.data.pinned ? now : null,
          pinnedByUserId: payload.data.pinned ? c.get("userId") : null,
          updatedAt: now
        })
        .where(eq(clubChatMessages.id, current.id));
      const updated = await database.query.clubChatMessages.findFirst({
        where: eq(clubChatMessages.id, current.id),
        with: { user: true }
      });
      return updated ? { message: updated } : { error: "Message not found", status: 404 as const };
    });
    if ("error" in pinResult) return c.json({ error: pinResult.error }, pinResult.status);
    return c.json({ ok: true, message: await serializeMessage(pinResult.message, c.get("userId"), role) });
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
      message: await serializeMessage(createdMessage, c.get("userId"), role)
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
      message: await serializeMessage(createdMessage, c.get("userId"), role)
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

    const messageId = c.req.param("id");
    const reactionResult = await db.transaction(async (transaction) => {
      const database = transaction as unknown as typeof db;
      await database.execute(sql`select id from club_chat_messages where id = ${messageId} for share`);
      const message = await database.query.clubChatMessages.findFirst({
        where: eq(clubChatMessages.id, messageId)
      });
      if (!message) return { error: "Message not found", status: 404 as const };
      if (message.status !== "visible" || message.deletedByUserAt) {
        return { error: "Message is unavailable", status: 409 as const };
      }
      const messageTopic = await database.query.clubChatTopics.findFirst({
        where: eq(clubChatTopics.id, message.topicId)
      });
      if (!messageTopic || !isTopicAccessibleForRole(messageTopic, role)) {
        return { error: "Message not found", status: 404 as const };
      }

      if (body.data.reaction === null) {
        await database
          .delete(clubMessageReactions)
          .where(and(eq(clubMessageReactions.messageId, message.id), eq(clubMessageReactions.userId, c.get("userId"))));
      } else {
        await database
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
      return { messageId: message.id };
    });
    if ("error" in reactionResult) return c.json({ error: reactionResult.error }, reactionResult.status);
    const updatedMessage = await findMessageWithUser(reactionResult.messageId);
    if (!updatedMessage) {
      return c.json({ error: "Message not found" }, 404);
    }

    return c.json({
      ok: true,
      message: await serializeMessage(updatedMessage, c.get("userId"), role)
    });
  });
