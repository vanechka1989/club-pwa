import { resolveDisplayName, type ClubMessage, type MessageReaction } from "@club/shared";

export type VisibleMessageReaction = Exclude<MessageReaction, "like" | "dislike">;

export type ChatMessageEventMap = {
  reply: [message: ClubMessage];
  react: [message: ClubMessage, reaction: VisibleMessageReaction];
  "open-actions": [message: ClubMessage];
  "jump-reply": [messageId: string];
  "poll-vote": [message: ClubMessage, optionIds: string[]];
  "poll-close": [message: ClubMessage];
  "toggle-reactions": [message: ClubMessage];
};

export interface CommunityViewer {
  id: string;
  photoUrl?: string | null;
  avatarPositionX?: number | null;
  avatarPositionY?: number | null;
  avatarScale?: number | null;
}

export interface ChatPollDraft {
  question: string;
  options: string[];
  allowsMultiple: boolean;
  isAnonymous: boolean;
  closesAt: string | null;
}

export type ChatComposerEventMap = {
  "send-text": [body: string];
  "send-voice": [blob: Blob, durationSeconds: number];
  "send-files": [files: File[]];
  "create-poll": [payload: ChatPollDraft];
  "draft-change": [body: string];
  "cancel-reply": [];
};

export const quickEmoji = ["👍", "🔥", "❤️", "😂", "👏", "💩"] as const;

export const reactionOptions: ReadonlyArray<{ value: VisibleMessageReaction; label: string }> = [
  { value: "thumbs_up", label: "👍" },
  { value: "fire", label: "🔥" },
  { value: "heart", label: "❤️" },
  { value: "laugh", label: "😂" },
  { value: "clap", label: "👏" },
  { value: "poop", label: "💩" }
];

export function authorName(message: ClubMessage) {
  return resolveDisplayName(message.author);
}

export function authorInitial(message: ClubMessage) {
  return authorName(message).slice(0, 1).toUpperCase();
}

export function avatarImageStyle(author: ClubMessage["author"]) {
  const positionX = author.avatarPositionX ?? 50;
  const positionY = author.avatarPositionY ?? 50;
  const scale = author.avatarScale ?? 1;

  return {
    objectPosition: `${positionX}% ${positionY}%`,
    transform: `scale(${scale})`,
    transformOrigin: `${positionX}% ${positionY}%`
  };
}

export function isOwnMessage(message: ClubMessage, viewer: CommunityViewer | null) {
  return message.author.id === viewer?.id;
}

export function isReplyToViewer(message: ClubMessage, viewer: CommunityViewer | null) {
  return message.replyTo?.author.id === viewer?.id && !isOwnMessage(message, viewer);
}

export function messageAuthorPhotoUrl(message: ClubMessage, viewer: CommunityViewer | null) {
  return isOwnMessage(message, viewer) ? (viewer?.photoUrl ?? message.author.photoUrl) : message.author.photoUrl;
}

export function messageAuthorAvatarStyle(message: ClubMessage, viewer: CommunityViewer | null) {
  if (!isOwnMessage(message, viewer) || !viewer) {
    return avatarImageStyle(message.author);
  }

  return avatarImageStyle({
    ...message.author,
    avatarPositionX: viewer.avatarPositionX ?? message.author.avatarPositionX,
    avatarPositionY: viewer.avatarPositionY ?? message.author.avatarPositionY,
    avatarScale: viewer.avatarScale ?? message.author.avatarScale
  });
}

export function reactionLabel(reaction: MessageReaction) {
  return reactionOptions.find((option) => option.value === reaction)?.label ?? "";
}

export function isVisibleReaction(reaction: MessageReaction): reaction is VisibleMessageReaction {
  return reactionOptions.some((option) => option.value === reaction);
}

export function visibleReactionCounts(message: ClubMessage) {
  return message.reactionCounts.filter(
    (reaction): reaction is { reaction: VisibleMessageReaction; count: number } =>
      isVisibleReaction(reaction.reaction)
  );
}

export function formatMessageTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatMuteLabel(message: ClubMessage) {
  if (!message.authorMute) {
    return "";
  }

  if (message.authorMute.kind === "permanent") {
    return "Мут бессрочно";
  }

  return `Мут до ${message.authorMute.expiresAt ? new Date(message.authorMute.expiresAt).toLocaleString("ru-RU") : ""}`;
}
