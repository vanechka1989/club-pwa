import type { MessageReaction, UserRole } from "@club/shared";
import { authorMutationWindowMs, canAuthorMutateMessage } from "./messageLifecycle";

type ReactionValue = MessageReaction;

export type MessageReactionRow = {
  userId: string;
  reaction: ReactionValue;
};

export type ReplySourceMessage = {
  id: string;
  body: string;
  user: {
    id: string;
    telegramId: string;
    firstName: string | null;
    username: string | null;
    displayName?: string | null;
    photoUrl: string | null;
    avatarPositionX?: number | null;
    avatarPositionY?: number | null;
    avatarScale?: number | null;
  };
};

export type MessageAuthorSource = ReplySourceMessage["user"];

type DeletedMessageSource = {
  body: string;
  deletedByUserAt: Date | null;
  deletedContentExpiresAt: Date | null;
};

type AuthorMutationSource = {
  userId: string;
  kind: string;
  isSystem: boolean;
  status: "visible" | "hidden" | "deleted";
  createdAt: Date;
  deletedByUserAt: Date | null;
};

type AuthorMutationContext = {
  currentUserId: string;
  role: UserRole;
  topic: { isLocked: boolean; isPublished: boolean };
  serverNow: Date;
};

function normalizeAvatarScale(value: number | null | undefined) {
  const scale = value ?? 100;
  return scale > 2.5 ? scale / 100 : scale;
}

export function buildMessageAuthor(user: MessageAuthorSource) {
  return {
    id: user.id,
    telegramId: user.telegramId,
    firstName: user.firstName,
    username: user.username,
    displayName: user.displayName ?? null,
    photoUrl: user.photoUrl,
    avatarPositionX: user.avatarPositionX ?? 50,
    avatarPositionY: user.avatarPositionY ?? 50,
    avatarScale: normalizeAvatarScale(user.avatarScale)
  };
}

export function summarizeReactions(reactions: MessageReactionRow[], currentUserId: string) {
  const counts = new Map<ReactionValue, number>();
  let myReaction: ReactionValue | null = null;

  for (const reaction of reactions) {
    counts.set(reaction.reaction, (counts.get(reaction.reaction) ?? 0) + 1);
    if (reaction.userId === currentUserId) {
      myReaction = reaction.reaction;
    }
  }

  return {
    likesCount: counts.get("like") ?? 0,
    dislikesCount: counts.get("dislike") ?? 0,
    reactionCounts: Array.from(counts.entries()).map(([reaction, count]) => ({ reaction, count })),
    myReaction
  };
}

export function getMessageContentView(message: DeletedMessageSource, role: UserRole, now = new Date()) {
  if (!message.deletedByUserAt) {
    return { body: message.body, revealContent: true, purged: false, contentRedacted: false };
  }

  const purged = !message.deletedContentExpiresAt || message.deletedContentExpiresAt <= now;
  const revealContent = role !== "member" && !purged;
  return {
    body: revealContent ? message.body : "Сообщение удалено",
    revealContent,
    purged,
    contentRedacted: !revealContent
  };
}

export function getAuthorMutationView(message: AuthorMutationSource, context: AuthorMutationContext) {
  const topicWritable = context.topic.isPublished && (!context.topic.isLocked || context.role !== "member");
  const candidate = topicWritable
    && message.userId === context.currentUserId
    && !message.isSystem
    && message.status === "visible"
    && !message.deletedByUserAt;
  const allowed = candidate && canAuthorMutateMessage(message, context.currentUserId, context.serverNow);

  return {
    canEdit: allowed && message.kind === "text",
    canDelete: allowed,
    allowedUntil: candidate
      ? new Date(message.createdAt.getTime() + authorMutationWindowMs).toISOString()
      : null
  };
}

export function buildReplyPreview(message: ReplySourceMessage | null, visibleBody = message?.body ?? "") {
  if (!message) {
    return null;
  }

  const prefix = visibleBody.slice(0, 70);
  const trimmedPrefix = prefix.includes(" ") ? prefix.slice(0, prefix.lastIndexOf(" ")) : prefix;
  const body = visibleBody.length > 73 ? `${trimmedPrefix}...` : visibleBody;

  return {
    id: message.id,
    body,
    author: buildMessageAuthor(message.user)
  };
}
