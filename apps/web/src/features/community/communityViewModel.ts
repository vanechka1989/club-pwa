import { resolveDisplayName, type ClubMessage, type ClubUser, type CommunityMention, type MessageReaction } from "@club/shared";
import type { QueuedTextMessage } from "./communityOutbox";

export type VisibleMessageReaction = Exclude<MessageReaction, "like" | "dislike">;

export type ChatMessageEventMap = {
  reply: [message: ClubMessage];
  react: [message: ClubMessage, reaction: VisibleMessageReaction];
  "open-actions": [message: ClubMessage];
  "jump-reply": [messageId: string];
  "poll-vote": [message: ClubMessage, optionIds: string[]];
  "poll-close": [message: ClubMessage];
  retry: [message: ClubMessage];
};

export interface CommunityViewer {
  id: string;
  photoUrl?: string | null;
  avatarPositionX?: number | null;
  avatarPositionY?: number | null;
  avatarScale?: number | null;
}

export function communityOptimisticMessage(entry: QueuedTextMessage, viewer: ClubUser): ClubMessage {
  return {
    id: `local:${entry.deliveryKey}`,
    topicId: entry.topicId,
    body: entry.body,
    kind: "text",
    voice: null,
    images: [],
    video: null,
    document: null,
    poll: null,
    isSystem: false,
    status: "visible",
    author: {
      id: viewer.id,
      telegramId: viewer.telegramId,
      firstName: viewer.firstName,
      username: viewer.username,
      displayName: viewer.displayName,
      photoUrl: viewer.photoUrl,
      avatarPositionX: viewer.avatarPositionX,
      avatarPositionY: viewer.avatarPositionY,
      avatarScale: viewer.avatarScale
    },
    replyTo: null,
    likesCount: 0,
    dislikesCount: 0,
    reactionCounts: [],
    myReaction: null,
    authorMute: null,
    pinnedAt: null,
    editedAt: null,
    deletedByUserAt: null,
    clientOperationId: entry.deliveryKey,
    mentions: entry.mentions,
    createdAt: new Date(entry.createdAt).toISOString()
  };
}

export interface ChatPollDraft {
  question: string;
  options: string[];
  allowsMultiple: boolean;
  isAnonymous: boolean;
  closesAt: string | null;
}

export type ChatComposerEventMap = {
  "send-text": [body: string, mentions: CommunityMention[]];
  "save-edit": [message: ClubMessage, body: string, mentions: CommunityMention[]];
  "send-voice": [blob: Blob, durationSeconds: number];
  "send-files": [files: File[]];
  "create-poll": [payload: ChatPollDraft];
  "draft-change": [body: string];
  "cancel-reply": [];
  "cancel-edit": [];
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

export function isUnreadCandidate(message: ClubMessage, viewer: CommunityViewer | null) {
  return message.status === "visible"
    && !message.isSystem
    && !message.deletedByUserAt
    && !isOwnMessage(message, viewer);
}

export function needsUnreadHistory(
  messages: ClubMessage[],
  viewer: CommunityViewer | null,
  unreadCount: number
) {
  return messages.filter((message) => isUnreadCandidate(message, viewer)).length < unreadCount;
}

export function communityMuteComposerText(mutedPermanently: boolean, mutedUntil: string | null) {
  if (mutedPermanently) return "Бессрочный мут. Вы пока не можете писать в чат.";
  return mutedUntil
    ? `Мут до ${new Date(mutedUntil).toLocaleString("ru-RU")}. Вы пока не можете писать в чат.`
    : "";
}

export function getOrCreateCommunityDeviceId(storageKey: string) {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)) {
      return stored;
    }
    const created = crypto.randomUUID();
    localStorage.setItem(storageKey, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
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

export type CommunityMessageDeliveryState = "sending" | "failed" | "sent";

export function communityMessageDeliveryState(
  message: ClubMessage,
  queuedMessages: QueuedTextMessage[]
): CommunityMessageDeliveryState {
  if (!message.id.startsWith("local:")) return "sent";
  const queued = queuedMessages.find((entry) => entry.deliveryKey === message.clientOperationId);
  return queued?.status === "failed" ? "failed" : "sending";
}

export function canEditOwnCommunityMessage(
  message: ClubMessage,
  viewer: CommunityViewer | null,
  now = Date.now()
) {
  if (
    message.isSystem
    || message.kind !== "text"
    || message.status !== "visible"
    || message.deletedByUserAt
    || message.id.startsWith("local:")
    || !isOwnMessage(message, viewer)
  ) {
    return false;
  }
  const elapsed = now - Date.parse(message.createdAt);
  return elapsed >= 0 && elapsed <= 15 * 60 * 1_000;
}

export function isCommunityMemberTombstone(message: ClubMessage, isModerator: boolean) {
  return !isModerator
    && message.kind === "text"
    && message.body === "Сообщение удалено"
    && !message.replyTo
    && !message.mentions.length;
}

function localDayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function canGroupCommunityMessages(previous: ClubMessage | undefined, current: ClubMessage | undefined) {
  if (!previous || !current || previous.isSystem || current.isSystem) return false;
  const elapsed = Date.parse(current.createdAt) - Date.parse(previous.createdAt);
  return previous.author.id === current.author.id
    && localDayKey(previous.createdAt) === localDayKey(current.createdAt)
    && elapsed >= 0
    && elapsed <= 5 * 60 * 1_000;
}

export function isCommunityDayStart(previous: ClubMessage | undefined, current: ClubMessage) {
  return !previous || localDayKey(previous.createdAt) !== localDayKey(current.createdAt);
}

export function formatCommunityMessageDay(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

export function communityMessageTextSegments(message: ClubMessage) {
  const mentions = [...message.mentions]
    .sort((left, right) => left.start - right.start)
    .filter((mention, index, sorted) =>
      message.body.slice(mention.start, mention.end) === `@${mention.displayName}`
      && (index === 0 || mention.start >= sorted[index - 1]!.end)
    );
  const segments: Array<{ text: string; mention: boolean }> = [];
  let offset = 0;
  for (const mention of mentions) {
    if (mention.start > offset) segments.push({ text: message.body.slice(offset, mention.start), mention: false });
    segments.push({ text: message.body.slice(mention.start, mention.end), mention: true });
    offset = mention.end;
  }
  if (offset < message.body.length) segments.push({ text: message.body.slice(offset), mention: false });
  return segments.length ? segments : [{ text: message.body, mention: false }];
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

export function communityMessageSignature(message: ClubMessage) {
  return [
    message.id,
    message.status,
    message.body,
    message.kind,
    message.voice?.url ?? "",
    message.voice?.deletedAt ?? "",
    message.images.map((image) => `${image.id}:${image.url ?? ""}:${image.deletedAt ?? ""}`).join("|"),
    message.poll ? `${message.poll.id}:${message.poll.closedAt ?? ""}:${message.poll.options.map((option) => `${option.id}:${option.votesCount}:${option.selected}`).join("|")}` : "",
    message.createdAt,
    message.author.photoUrl ?? "",
    message.author.avatarPositionX ?? "",
    message.author.avatarPositionY ?? "",
    message.author.avatarScale ?? "",
    message.likesCount,
    message.dislikesCount,
    message.reactionCounts.map((reaction) => `${reaction.reaction}:${reaction.count}`).join(","),
    message.myReaction ?? "",
    message.authorMute?.id ?? "",
    message.authorMute?.kind ?? "",
    message.authorMute?.expiresAt ?? "",
    message.replyTo?.id ?? "",
    message.replyTo?.body ?? "",
    message.pinnedAt ?? "",
    message.editedAt ?? "",
    message.deletedByUserAt ?? "",
    message.clientOperationId ?? "",
    message.mentions.map((mention) => `${mention.userId}:${mention.start}:${mention.end}:${mention.displayName}`).join("|")
  ].join("\u001f");
}

export function communityMessagesSignature(messages: ClubMessage[]) {
  return messages.map(communityMessageSignature).join("\u001e");
}

function headPaginationIdentity(messages: ClubMessage[], cursor: string | null) {
  const messageIds = messages
    .filter((message) => !message.id.startsWith("local:"))
    .map((message) => message.id)
    .join("\u001f");
  return `${messageIds}\u001e${cursor ?? ""}`;
}

export function headChanged(
  currentMessages: ClubMessage[],
  currentCursor: string | null,
  nextMessages: ClubMessage[],
  nextCursor: string | null
) {
  return headPaginationIdentity(currentMessages, currentCursor) !== headPaginationIdentity(nextMessages, nextCursor);
}

export function communityErrorStatus(reason: unknown) {
  if (!reason || typeof reason !== "object") return null;
  if ("status" in reason && typeof reason.status === "number") return reason.status;
  if ("statusCode" in reason && typeof reason.statusCode === "number") return reason.statusCode;
  if ("response" in reason && reason.response && typeof reason.response === "object" && "status" in reason.response) {
    return typeof reason.response.status === "number" ? reason.response.status : null;
  }
  return null;
}
