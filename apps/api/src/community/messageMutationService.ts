import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  resolveDisplayName,
  type CommunityMention,
  type CommunityNotificationMode,
  type UserRole
} from "@club/shared";
import { getUserRole, hasAdminPermission } from "../admin/roles";
import { db } from "../db/client";
import {
  clubChatMessages,
  clubChatTopics,
  clubMessageMentions,
  communityTopicNotificationSettings,
  users
} from "../db/schema";
import { getMembership } from "../membership/getMembership";
import { createAppNotification, type CreateAppNotificationInput } from "../notifications/create";
import { buildMessageAuthor } from "./messageMetadata";
import { canAuthorMutateMessage, getDeletedContentExpiry } from "./messageLifecycle";
import { validateMentionRanges, type ValidatedMentionRange } from "./mentions";
import { shouldNotifyCommunityUser } from "./notificationPolicy";
import { publishCommunityChange } from "./realtime";
import { formatReplyNotificationText } from "./replyNotification";
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
  }): Promise<MutationMessage | null>;
  getMentions(messageId: string): Promise<StoredMention[]>;
  insertMentions(messageId: string, mentions: StoredMention[]): Promise<void>;
  replaceMentions(messageId: string, mentions: StoredMention[]): Promise<void>;
  updateText(messageId: string, body: string, editedAt: Date): Promise<MutationMessage>;
  markDeletedByAuthor(messageId: string, deletedAt: Date, expiresAt: Date): Promise<MutationMessage>;
}

export interface MessageMutationRepository {
  transaction<T>(work: (store: MessageMutationStore) => Promise<T>): Promise<T>;
  listParticipantCandidates(query: string, limit: number): Promise<MutationUser[]>;
  listNotificationCandidates(
    topicId: string,
    explicitUserIds: string[]
  ): Promise<Array<{ user: MutationUser; mode: CommunityNotificationMode }>>;
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
  createNotification: (input: CreateAppNotificationInput) => Promise<unknown>;
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

function sameMentions(left: readonly StoredMention[], right: readonly StoredMention[]) {
  const byRange = (value: StoredMention) => `${value.start}:${value.end}:${value.userId}`;
  return [...left].map(byRange).sort().join("|") === [...right].map(byRange).sort().join("|");
}

async function assertSameOperation(
  store: MessageMutationStore,
  existing: MutationMessage,
  input: CreateTextInput,
  mentions: ValidatedMentionRange[]
) {
  const existingMentions = await store.getMentions(existing.id);
  if (
    existing.kind !== "text" ||
    existing.topicId !== input.topicId ||
    existing.body !== input.body ||
    existing.replyToMessageId !== input.replyToMessageId ||
    !sameMentions(existingMentions, mentions)
  ) {
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

function notificationTitle(reason: "reply" | "mention" | "all", topicTitle: string) {
  if (reason === "reply") return `Ответ в чате: ${topicTitle}`;
  if (reason === "mention") return `Вас упомянули: ${topicTitle}`;
  return `Новое сообщение: ${topicTitle}`;
}

export function createMessageMutationService(dependencies: MessageMutationDependencies) {
  const { repository, createNotification, canUserAccessTopic, publishChange } = dependencies;

  async function notifyCreatedMessage(input: {
    message: MutationMessage;
    topic: MutationTopic;
    sender: MutationUser;
    replyUserId: string | null;
    mentionUserIds: string[];
  }) {
    const explicitIds = Array.from(new Set([
      ...(input.replyUserId ? [input.replyUserId] : []),
      ...input.mentionUserIds
    ]));
    const candidates = await repository.listNotificationCandidates(input.topic.id, explicitIds);
    const mentionedIds = new Set(input.mentionUserIds);

    for (const candidate of candidates) {
      const replied = candidate.user.id === input.replyUserId;
      const mentioned = mentionedIds.has(candidate.user.id);
      if (!shouldNotifyCommunityUser({
        mode: candidate.mode,
        mentioned,
        replied,
        senderUserId: input.sender.id,
        recipientUserId: candidate.user.id
      })) continue;
      if (!(await canUserAccessTopic(candidate.user, input.topic))) continue;

      const reason = replied ? "reply" : mentioned ? "mention" : "all";
      await createNotification({
        userId: candidate.user.id,
        kind: "client",
        title: notificationTitle(reason, input.topic.title),
        body: formatReplyNotificationText({
          senderName: resolveDisplayName(input.sender),
          topicTitle: input.topic.title,
          body: input.message.body
        }),
        source: `community_${reason}`,
        sourceId: input.message.id,
        pushUrl: `/community/topics/${input.topic.id}?message=${input.message.id}`,
        deduplicate: true
      });
    }
  }

  return {
    async createText(input: CreateTextInput) {
      const mentions = normalizeMentions(input.body, input.mentions);
      const result = await repository.transaction(async (store) => {
        const prior = await store.findMessageByOperation(input.userId, input.clientOperationId);
        if (prior) {
          await assertSameOperation(store, prior, input, mentions);
          const topic = assertTopicReadable(await store.findTopicForMutation(prior.topicId), input.role);
          const sender = (await store.findUsersByIds([input.userId]))[0];
          if (!sender) throw new Error("Unable to resolve message sender");
          const reply = prior.replyToMessageId
            ? await store.findReplyForMutation(prior.replyToMessageId, prior.topicId)
            : null;
          return { message: prior, created: false as const, topic, sender, replyUserId: reply?.userId ?? null };
        }

        const topic = assertTopicWritable(await store.findTopicForMutation(input.topicId), input.role);
        const sender = await validateSelectedUsers(store, input, topic, mentions, canUserAccessTopic);
        const reply = input.replyToMessageId
          ? await store.findReplyForMutation(input.replyToMessageId, topic.id)
          : null;
        if (
          input.replyToMessageId &&
          (!reply || reply.isSystem || reply.status !== "visible" || reply.deletedByUserAt)
        ) {
          throw mutationError("reply_not_available", 400, "Reply message is unavailable");
        }

        const inserted = await store.insertText({
          topicId: topic.id,
          userId: input.userId,
          body: input.body,
          replyToMessageId: input.replyToMessageId,
          clientOperationId: input.clientOperationId
        });
        if (!inserted) {
          const winner = await store.findMessageByOperation(input.userId, input.clientOperationId);
          if (!winner) throw new Error("Idempotent message insert did not return its winner");
          await assertSameOperation(store, winner, input, mentions);
          return {
            message: winner,
            created: false as const,
            topic,
            sender,
            replyUserId: reply?.userId ?? null
          };
        }

        await store.insertMentions(inserted.id, mentions);
        return {
          message: inserted,
          created: true as const,
          topic,
          sender,
          replyUserId: reply?.userId ?? null
        };
      });

      if (result.created) publishChange(result.message.topicId);
      await notifyCreatedMessage({
        message: result.message,
        topic: result.topic,
        sender: result.sender,
        replyUserId: result.replyUserId,
        mentionUserIds: mentions.map((mention) => mention.userId)
      });

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

function createDrizzleStore(database: typeof db): MessageMutationStore {
  return {
    async getServerNow() {
      const rows = Array.from((await database.execute(sql`select clock_timestamp() as "now"`)) as Iterable<{ now: Date }>);
      const now = rows[0]?.now;
      if (!(now instanceof Date)) throw new Error("Database clock is unavailable");
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
          clientOperationId: input.clientOperationId
        })
        .onConflictDoNothing()
        .returning();
      return created ? toMutationMessage(created) : null;
    },
    async getMentions(messageId) {
      const rows = await database.query.clubMessageMentions.findMany({
        where: eq(clubMessageMentions.messageId, messageId)
      });
      return rows.map((row) => ({ userId: row.userId, start: row.startOffset, end: row.endOffset }));
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
    }
  };
}

export function createMessageMutationRepository(database: typeof db = db): MessageMutationRepository {
  return {
    transaction: (work) => database.transaction((transaction) =>
      work(createDrizzleStore(transaction as unknown as typeof db))),
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
    async listNotificationCandidates(topicId, explicitUserIds) {
      const explicitCondition = explicitUserIds.length ? inArray(users.id, explicitUserIds) : undefined;
      const rows = await database
        .select({ user: users, mode: communityTopicNotificationSettings.mode })
        .from(users)
        .leftJoin(
          communityTopicNotificationSettings,
          and(
            eq(communityTopicNotificationSettings.userId, users.id),
            eq(communityTopicNotificationSettings.topicId, topicId)
          )
        )
        .where(or(explicitCondition, eq(communityTopicNotificationSettings.mode, "all")));
      return rows.map((row) => ({
        user: row.user,
        mode: (row.mode ?? "mentions") as CommunityNotificationMode
      }));
    }
  };
}

export const messageMutationRepository = createMessageMutationRepository();

export const messageMutationService = createMessageMutationService({
  repository: messageMutationRepository,
  createNotification: createAppNotification,
  canUserAccessTopic: defaultCanUserAccessTopic,
  publishChange: publishCommunityChange
});
