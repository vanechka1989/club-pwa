import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  resolveDisplayName,
  type CommunityMention,
  type UserRole
} from "@club/shared";
import { getUserRole, hasAdminPermission } from "../admin/roles";
import { db } from "../db/client";
import {
  clubChatMessages,
  clubChatTopics,
  clubMessageAttachments,
  clubMessageMentions,
  communityNotificationOutbox,
  appNotifications,
  users
} from "../db/schema";
import { getMembership } from "../membership/getMembership";
import {
  type CreateAppNotificationInput,
  type CreateAppNotificationOptions
} from "../notifications/create";
import { createRequestFingerprint } from "../idempotency/operation";
import { buildMessageAuthor } from "./messageMetadata";
import { canAuthorMutateMessage, getDeletedContentExpiry } from "./messageLifecycle";
import { validateMentionRanges, type ValidatedMentionRange } from "./mentions";
import { publishCommunityChange } from "./realtime";
import { isTopicAccessibleForRole } from "./topicAccess";

export type MutationTopic = Pick<
  typeof clubChatTopics.$inferSelect,
  "id" | "title" | "isLocked" | "isPublished" | "isAdminOnly"
>;

export type MutationUser = Pick<
  typeof users.$inferSelect,
  | "id"
  | "telegramId"
  | "firstName"
  | "username"
  | "displayName"
  | "photoUrl"
  | "avatarPositionX"
  | "avatarPositionY"
  | "avatarScale"
>;

export type MutationMessage = Pick<
  typeof clubChatMessages.$inferSelect,
  | "id"
  | "topicId"
  | "userId"
  | "replyToMessageId"
  | "body"
  | "kind"
  | "isSystem"
  | "status"
  | "clientOperationId"
  | "createRequestFingerprint"
  | "editedAt"
  | "deletedByUserAt"
  | "deletedContentExpiresAt"
  | "createdAt"
  | "updatedAt"
>;

export type StoredMention = { userId: string; start: number; end: number };

export interface MessageMutationStore {
  getServerNow(): Promise<Date>;
  findTopicForMutation(topicId: string): Promise<MutationTopic | null>;
  findMessageByOperation(userId: string, clientOperationId: string): Promise<MutationMessage | null>;
  findMessageForMutation(messageId: string): Promise<MutationMessage | null>;
  findReplyForMutation(messageId: string, topicId: string): Promise<MutationMessage | null>;
  findUsersByIds(userIds: string[]): Promise<MutationUser[]>;
  insertText(input: {
    topicId: string;
    userId: string;
    body: string;
    replyToMessageId: string | null;
    clientOperationId: string;
    createRequestFingerprint: string;
  }): Promise<MutationMessage | null>;
  insertMentions(messageId: string, mentions: StoredMention[]): Promise<void>;
  enqueueNotifications(input: {
    messageId: string;
    topicId: string;
    topicTitle: string;
    senderUserId: string;
    senderName: string;
    replyUserId: string | null;
    mentionUserIds: string[];
  }): Promise<void>;
  replaceMentions(messageId: string, mentions: StoredMention[]): Promise<void>;
  updateText(messageId: string, body: string, editedAt: Date): Promise<MutationMessage>;
  markDeletedByAuthor(messageId: string, deletedAt: Date, expiresAt: Date): Promise<MutationMessage>;
  deleteMessageNotifications(messageId: string): Promise<void>;
}

export interface MessageMutationRepository {
  transaction<T>(work: (store: MessageMutationStore) => Promise<T>): Promise<T>;
  listParticipantCandidates(query: string, limit: number): Promise<MutationUser[]>;
}

export class MessageMutationError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 403 | 404 | 409,
    message: string
  ) {
    super(message);
    this.name = "MessageMutationError";
  }
}

type CreateTextInput = {
  topicId: string;
  userId: string;
  role: UserRole;
  body: string;
  replyToMessageId: string | null;
  clientOperationId: string;
  mentions: CommunityMention[];
};

type EditTextInput = {
  messageId: string;
  userId: string;
  role: UserRole;
  body: string;
  mentions: CommunityMention[];
};

type DeleteMessageInput = {
  messageId: string;
  userId: string;
  role: UserRole;
};

type MessageMutationDependencies = {
  repository: MessageMutationRepository;
  createNotification?: (
    input: CreateAppNotificationInput,
    options?: CreateAppNotificationOptions
  ) => Promise<unknown>;
  canUserAccessTopic: (user: MutationUser, topic: MutationTopic) => Promise<boolean>;
  publishChange: (topicId: string) => unknown;
};

function mutationError(code: string, status: MessageMutationError["status"], message: string) {
  return new MessageMutationError(code, status, message);
}

function normalizeMentions(body: string, mentions: readonly CommunityMention[]) {
  try {
    const normalized = validateMentionRanges(body, mentions);
    if (new Set(normalized.map((mention) => mention.userId)).size !== normalized.length) {
      throw new Error("A participant can be mentioned only once");
    }
    return normalized;
  } catch {
    throw mutationError("invalid_mention", 400, "Invalid mention selection");
  }
}

function messageCreateFingerprint(
  input: Pick<CreateTextInput, "topicId" | "body" | "replyToMessageId">,
  mentions: readonly ValidatedMentionRange[]
) {
  return createRequestFingerprint({
    kind: "text",
    topicId: input.topicId,
    body: input.body,
    replyToMessageId: input.replyToMessageId,
    mentions: mentions.map(({ userId, start, end }) => ({ userId, start, end }))
  });
}

function assertSameOperation(existing: MutationMessage, createRequestFingerprint: string) {
  if (existing.createRequestFingerprint !== createRequestFingerprint) {
    throw mutationError("operation_conflict", 409, "Operation id was already used for another message");
  }
}

function assertTopicWritable(topic: MutationTopic | null, role: UserRole) {
  if (!topic || !isTopicAccessibleForRole(topic, role)) {
    throw mutationError("topic_not_found", 404, "Topic not found");
  }
  if (topic.isLocked && role === "member") {
    throw mutationError("topic_locked", 403, "Topic is locked");
  }
  return topic;
}

function assertTopicReadable(topic: MutationTopic | null, role: UserRole) {
  if (!topic || !isTopicAccessibleForRole(topic, role)) {
    throw mutationError("topic_not_found", 404, "Topic not found");
  }
  return topic;
}

async function validateSelectedUsers(
  store: MessageMutationStore,
  input: CreateTextInput | EditTextInput,
  topic: MutationTopic,
  mentions: ValidatedMentionRange[],
  canUserAccessTopic: MessageMutationDependencies["canUserAccessTopic"]
) {
  const requestedIds = Array.from(new Set([input.userId, ...mentions.map((mention) => mention.userId)]));
  const selectedUsers = await store.findUsersByIds(requestedIds);
  const byId = new Map(selectedUsers.map((user) => [user.id, user]));
  const sender = byId.get(input.userId);
  if (!sender) {
    throw new Error("Unable to resolve message sender");
  }

  for (const mention of input.mentions) {
    const selected = byId.get(mention.userId);
    if (
      !selected ||
      resolveDisplayName(selected) !== mention.displayName ||
      !(await canUserAccessTopic(selected, topic))
    ) {
      throw mutationError("invalid_mention", 400, "Invalid mention selection");
    }
  }

  return sender;
}

async function defaultCanUserAccessTopic(user: MutationUser, topic: MutationTopic) {
  const baseRole = await getUserRole(user.telegramId);
  const role: UserRole = baseRole === "admin" && !(await hasAdminPermission(user.telegramId, "community"))
    ? "member"
    : baseRole;

  if (!isTopicAccessibleForRole(topic, role)) return false;
  if (role !== "member") return true;
  return (await getMembership(user.id)).isActive;
}

export function createMessageMutationService(dependencies: MessageMutationDependencies) {
  const { repository, canUserAccessTopic, publishChange } = dependencies;

  async function notifyCreatedMessage(store: MessageMutationStore, input: {
    message: MutationMessage;
    topic: MutationTopic;
    sender: MutationUser;
    replyUserId: string | null;
    mentionUserIds: string[];
  }) {
    await store.enqueueNotifications({
      messageId: input.message.id,
      topicId: input.topic.id,
      topicTitle: input.topic.title,
      senderUserId: input.sender.id,
      senderName: resolveDisplayName(input.sender),
      replyUserId: input.replyUserId,
      mentionUserIds: input.mentionUserIds
    });
  }

  return {
    async createText(input: CreateTextInput) {
      const normalizedInput = { ...input, body: input.body.trim() };
      const mentions = normalizeMentions(normalizedInput.body, normalizedInput.mentions);
      const createRequestFingerprint = messageCreateFingerprint(normalizedInput, mentions);
      const result = await repository.transaction(async (store) => {
        const prior = await store.findMessageByOperation(normalizedInput.userId, normalizedInput.clientOperationId);
        if (prior) {
          assertSameOperation(prior, createRequestFingerprint);
          const topic = assertTopicReadable(await store.findTopicForMutation(prior.topicId), normalizedInput.role);
          const sender = (await store.findUsersByIds([normalizedInput.userId]))[0];
          if (!sender) throw new Error("Unable to resolve message sender");
          const reply = prior.replyToMessageId
            ? await store.findReplyForMutation(prior.replyToMessageId, prior.topicId)
            : null;
          if (prior.status === "visible" && !prior.deletedByUserAt) {
            await notifyCreatedMessage(store, {
              message: prior,
              topic,
              sender,
              replyUserId: reply?.userId ?? null,
              mentionUserIds: mentions.map((mention) => mention.userId)
            });
          }
          return { message: prior, created: false as const, topic, sender, replyUserId: reply?.userId ?? null };
        }

        const topic = assertTopicWritable(await store.findTopicForMutation(normalizedInput.topicId), normalizedInput.role);
        const sender = await validateSelectedUsers(store, normalizedInput, topic, mentions, canUserAccessTopic);
        const reply = normalizedInput.replyToMessageId
          ? await store.findReplyForMutation(normalizedInput.replyToMessageId, topic.id)
          : null;
        if (
          normalizedInput.replyToMessageId &&
          (!reply || reply.isSystem || reply.status !== "visible" || reply.deletedByUserAt)
        ) {
          throw mutationError("reply_not_available", 400, "Reply message is unavailable");
        }

        const inserted = await store.insertText({
          topicId: topic.id,
          userId: normalizedInput.userId,
          body: normalizedInput.body,
          replyToMessageId: normalizedInput.replyToMessageId,
          clientOperationId: normalizedInput.clientOperationId,
          createRequestFingerprint
        });
        if (!inserted) {
          const winner = await store.findMessageByOperation(normalizedInput.userId, normalizedInput.clientOperationId);
          if (!winner) throw new Error("Idempotent message insert did not return its winner");
          assertSameOperation(winner, createRequestFingerprint);
          if (winner.status === "visible" && !winner.deletedByUserAt) {
            await notifyCreatedMessage(store, {
              message: winner,
              topic,
              sender,
              replyUserId: reply?.userId ?? null,
              mentionUserIds: mentions.map((mention) => mention.userId)
            });
          }
          return {
            message: winner,
            created: false as const,
            topic,
            sender,
            replyUserId: reply?.userId ?? null
          };
        }

        await store.insertMentions(inserted.id, mentions);
        await notifyCreatedMessage(store, {
          message: inserted,
          topic,
          sender,
          replyUserId: reply?.userId ?? null,
          mentionUserIds: mentions.map((mention) => mention.userId)
        });
        return {
          message: inserted,
          created: true as const,
          topic,
          sender,
          replyUserId: reply?.userId ?? null
        };
      });

      if (result.created) publishChange(result.message.topicId);

      return { message: result.message, created: result.created };
    },

    async editText(input: EditTextInput) {
      const mentions = normalizeMentions(input.body, input.mentions);
      const result = await repository.transaction(async (store) => {
        const current = await store.findMessageForMutation(input.messageId);
        if (!current) throw mutationError("message_not_found", 404, "Message not found");
        const topic = assertTopicWritable(await store.findTopicForMutation(current.topicId), input.role);
        if (current.kind !== "text" || current.isSystem || current.status !== "visible") {
          throw mutationError("message_not_editable", 409, "Message cannot be edited");
        }
        const now = await store.getServerNow();
        if (current.userId !== input.userId) {
          throw mutationError("not_message_author", 403, "Only the author can edit this message");
        }
        if (!canAuthorMutateMessage(current, input.userId, now)) {
          throw mutationError("mutation_window_expired", 409, "Message mutation window has expired");
        }
        await validateSelectedUsers(store, input, topic, mentions, canUserAccessTopic);
        const updated = await store.updateText(current.id, input.body, now);
        await store.replaceMentions(current.id, mentions);
        return { message: updated };
      });
      publishChange(result.message.topicId);
      return result;
    },

    async deleteMessage(input: DeleteMessageInput) {
      const result = await repository.transaction(async (store) => {
        const current = await store.findMessageForMutation(input.messageId);
        if (!current) throw mutationError("message_not_found", 404, "Message not found");
        assertTopicWritable(await store.findTopicForMutation(current.topicId), input.role);
        if (current.isSystem || current.status !== "visible") {
          throw mutationError("message_not_deletable", 409, "Message cannot be deleted");
        }
        if (current.userId !== input.userId) {
          throw mutationError("not_message_author", 403, "Only the author can delete this message");
        }
        const now = await store.getServerNow();
        if (!canAuthorMutateMessage(current, input.userId, now)) {
          throw mutationError("mutation_window_expired", 409, "Message mutation window has expired");
        }
        await store.deleteMessageNotifications(current.id);
        return {
          message: await store.markDeletedByAuthor(current.id, now, getDeletedContentExpiry(now))
        };
      });
      publishChange(result.message.topicId);
      return result;
    },

    async findParticipants(input: { query: string; limit: number }) {
      const publicTopic: MutationTopic = {
        id: "00000000-0000-0000-0000-000000000000",
        title: "Community",
        isLocked: false,
        isPublished: true,
        isAdminOnly: false
      };
      const candidates = await repository.listParticipantCandidates(input.query, Math.min(input.limit * 5, 100));
      const participants = [];
      for (const candidate of candidates) {
        if (await canUserAccessTopic(candidate, publicTopic)) {
          participants.push(buildMessageAuthor(candidate));
          if (participants.length === input.limit) break;
        }
      }
      return participants;
    }
  };
}

function toMutationMessage(message: typeof clubChatMessages.$inferSelect): MutationMessage {
  return message;
}

function createDrizzleStore(
  database: typeof db,
  loadOwnerTelegramId: () => Promise<string>
): MessageMutationStore {
  return {
    async getServerNow() {
      const rows = Array.from((await database.execute(sql`select clock_timestamp() as "now"`)) as Iterable<{ now: Date | string }>);
      const rawNow = rows[0]?.now;
      const now = rawNow instanceof Date ? rawNow : new Date(rawNow ?? Number.NaN);
      if (Number.isNaN(now.getTime())) throw new Error("Database clock is unavailable");
      return now;
    },
    async findTopicForMutation(topicId) {
      await database.execute(sql`select id from club_chat_topics where id = ${topicId} for share`);
      return (await database.query.clubChatTopics.findFirst({ where: eq(clubChatTopics.id, topicId) })) ?? null;
    },
    async findMessageByOperation(userId, clientOperationId) {
      return (await database.query.clubChatMessages.findFirst({
        where: and(
          eq(clubChatMessages.userId, userId),
          eq(clubChatMessages.clientOperationId, clientOperationId)
        )
      })) ?? null;
    },
    async findMessageForMutation(messageId) {
      await database.execute(sql`select id from club_chat_messages where id = ${messageId} for update`);
      return (await database.query.clubChatMessages.findFirst({ where: eq(clubChatMessages.id, messageId) })) ?? null;
    },
    async findReplyForMutation(messageId, topicId) {
      await database.execute(sql`select id from club_chat_messages where id = ${messageId} for share`);
      return (await database.query.clubChatMessages.findFirst({
        where: and(eq(clubChatMessages.id, messageId), eq(clubChatMessages.topicId, topicId))
      })) ?? null;
    },
    async findUsersByIds(userIds) {
      if (!userIds.length) return [];
      return database.query.users.findMany({ where: inArray(users.id, userIds) });
    },
    async insertText(input) {
      const [created] = await database
        .insert(clubChatMessages)
        .values({
          topicId: input.topicId,
          userId: input.userId,
          body: input.body,
          replyToMessageId: input.replyToMessageId,
          clientOperationId: input.clientOperationId,
          createRequestFingerprint: input.createRequestFingerprint
        })
        .onConflictDoNothing()
        .returning();
      return created ? toMutationMessage(created) : null;
    },
    async insertMentions(messageId, mentions) {
      if (!mentions.length) return;
      await database.insert(clubMessageMentions).values(
        mentions.map((mention) => ({
          messageId,
          userId: mention.userId,
          startOffset: mention.start,
          endOffset: mention.end
        }))
      );
    },
    async enqueueNotifications(input) {
      const { enqueueCommunityNotificationsWithDependencies } = await import("../notifications/communityOutbox");
      await enqueueCommunityNotificationsWithDependencies(input, {
        database,
        ownerTelegramId: await loadOwnerTelegramId()
      });
    },
    async replaceMentions(messageId, mentions) {
      await database.delete(clubMessageMentions).where(eq(clubMessageMentions.messageId, messageId));
      if (mentions.length) {
        await database.insert(clubMessageMentions).values(
          mentions.map((mention) => ({
            messageId,
            userId: mention.userId,
            startOffset: mention.start,
            endOffset: mention.end
          }))
        );
      }
    },
    async updateText(messageId, body, editedAt) {
      const [updated] = await database
        .update(clubChatMessages)
        .set({ body, editedAt, updatedAt: editedAt })
        .where(eq(clubChatMessages.id, messageId))
        .returning();
      if (!updated) throw new Error("Message disappeared while editing");
      return toMutationMessage(updated);
    },
    async markDeletedByAuthor(messageId, deletedAt, expiresAt) {
      await database
        .update(clubMessageAttachments)
        .set({ expiresAt })
        .where(eq(clubMessageAttachments.messageId, messageId));
      const [updated] = await database
        .update(clubChatMessages)
        .set({
          deletedByUserAt: deletedAt,
          deletedContentExpiresAt: expiresAt,
          pinnedAt: null,
          pinnedByUserId: null,
          updatedAt: deletedAt
        })
        .where(and(eq(clubChatMessages.id, messageId), isNull(clubChatMessages.deletedByUserAt)))
        .returning();
      if (!updated) throw mutationError("message_not_deletable", 409, "Message cannot be deleted");
      return toMutationMessage(updated);
    },
    async deleteMessageNotifications(messageId) {
      await database.update(communityNotificationOutbox).set({
        status: "suppressed",
        deliveredAt: new Date(),
        updatedAt: new Date()
      }).where(and(
        eq(communityNotificationOutbox.messageId, messageId),
        inArray(communityNotificationOutbox.status, ["pending", "claimed"])
      ));
      await database.delete(appNotifications).where(and(
        eq(appNotifications.sourceId, messageId),
        inArray(appNotifications.source, ["community_reply", "community_mention", "community_all"])
      ));
    }
  };
}

export function createMessageMutationRepository(
  database: typeof db = db,
  loadOwnerTelegramId: () => Promise<string> = async () =>
    (await import("../admin/roles")).getOwnerTelegramId()
): MessageMutationRepository {
  return {
    transaction: (work) => database.transaction((transaction) =>
      work(createDrizzleStore(transaction as unknown as typeof db, loadOwnerTelegramId))),
    async listParticipantCandidates(query, limit) {
      const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
      return database.query.users.findMany({
        where: or(
          ilike(users.displayName, pattern),
          ilike(users.firstName, pattern),
          ilike(users.username, pattern)
        ),
        orderBy: (table, { asc }) => [asc(table.displayName), asc(table.firstName), asc(table.id)],
        limit
      });
    },
  };
}

export const messageMutationRepository = createMessageMutationRepository();

export const messageMutationService = createMessageMutationService({
  repository: messageMutationRepository,
  canUserAccessTopic: defaultCanUserAccessTopic,
  publishChange: publishCommunityChange
});
