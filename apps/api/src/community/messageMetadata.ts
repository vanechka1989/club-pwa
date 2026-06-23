type ReactionValue = "like" | "dislike";

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
  };
};

export function summarizeReactions(reactions: MessageReactionRow[], currentUserId: string) {
  return reactions.reduce(
    (summary, reaction) => ({
      likesCount: summary.likesCount + (reaction.reaction === "like" ? 1 : 0),
      dislikesCount: summary.dislikesCount + (reaction.reaction === "dislike" ? 1 : 0),
      myReaction: reaction.userId === currentUserId ? reaction.reaction : summary.myReaction
    }),
    {
      likesCount: 0,
      dislikesCount: 0,
      myReaction: null as ReactionValue | null
    }
  );
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
      username: message.user.username
    }
  };
}
