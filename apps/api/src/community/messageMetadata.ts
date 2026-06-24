import type { MessageReaction } from "@club/shared";

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
    photoUrl: string | null;
  };
};

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

export function buildReplyPreview(message: ReplySourceMessage | null) {
  if (!message) {
    return null;
  }

  const prefix = message.body.slice(0, 70);
  const trimmedPrefix = prefix.includes(" ") ? prefix.slice(0, prefix.lastIndexOf(" ")) : prefix;
  const body = message.body.length > 73 ? `${trimmedPrefix}...` : message.body;

  return {
    id: message.id,
    body,
    author: {
      id: message.user.id,
      telegramId: message.user.telegramId,
      firstName: message.user.firstName,
      username: message.user.username,
      photoUrl: message.user.photoUrl
    }
  };
}
