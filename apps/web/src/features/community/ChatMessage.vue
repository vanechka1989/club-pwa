<script setup lang="ts">
import { resolveDisplayName, type ClubMessage } from "@club/shared";
import { CheckCheck, Clock3, MoreVertical, Pin, RefreshCw } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref } from "vue";
import ChatFileMessage from "./ChatFileMessage.vue";
import ChatImageGallery from "./ChatImageGallery.vue";
import ChatPollMessage from "./ChatPollMessage.vue";
import ChatVoiceMessage from "./ChatVoiceMessage.vue";
import {
  authorInitial,
  authorName,
  communityMessageTextSegments,
  formatMessageTime,
  isCommunityMemberTombstone,
  isOwnMessage,
  isReplyToViewer,
  messageAuthorAvatarStyle,
  messageAuthorPhotoUrl,
  reactionLabel,
  visibleReactionCounts,
  type ChatMessageEventMap,
  type CommunityMessageDeliveryState,
  type CommunityViewer,
} from "./communityViewModel";

const props = defineProps<{
  message: ClubMessage;
  viewer: CommunityViewer | null;
  isModerator: boolean;
  messageSaving: boolean;
  highlighted: boolean;
  groupedWithPrevious?: boolean;
  groupedWithNext?: boolean;
  deliveryState?: CommunityMessageDeliveryState;
  refreshAttachmentUrl?: ((messageId: string, attachmentId: string) => Promise<string | null>) | undefined;
}>();

const emit = defineEmits<ChatMessageEventMap>();

const pointerStartX = ref<number | null>(null);
const pointerStartY = ref<number | null>(null);
const swipeOffset = ref(0);
const swiping = ref(false);
let longPressTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

const ownMessage = computed(() => isOwnMessage(props.message, props.viewer));
const replyToViewer = computed(() => isReplyToViewer(props.message, props.viewer));
const photoUrl = computed(() => messageAuthorPhotoUrl(props.message, props.viewer));
const avatarStyle = computed(() => messageAuthorAvatarStyle(props.message, props.viewer));
const reactions = computed(() => visibleReactionCounts(props.message));
const textSegments = computed(() => communityMessageTextSegments(props.message));

function refreshMessageAttachment(attachmentId: string) {
  return props.refreshAttachmentUrl?.(props.message.id, attachmentId) ?? Promise.resolve(null);
}
const memberTombstone = computed(() => isCommunityMemberTombstone(props.message, props.isModerator));

function cancelLongPress() {
  if (longPressTimer) globalThis.clearTimeout(longPressTimer);
  longPressTimer = null;
}

function scheduleLongPress() {
  cancelLongPress();
  if (props.message.isSystem || memberTombstone.value) return;
  longPressTimer = globalThis.setTimeout(() => {
    longPressTimer = null;
    resetSwipeTracking();
    emit("open-actions", props.message);
  }, 500);
}

function resetSwipeTracking() {
  pointerStartX.value = null;
  pointerStartY.value = null;
  swipeOffset.value = 0;
  swiping.value = false;
}

function startSwipeTracking(clientX: number, clientY: number) {
  if (props.message.isSystem) {
    return;
  }

  pointerStartX.value = clientX;
  pointerStartY.value = clientY;
  swipeOffset.value = 0;
  swiping.value = true;
}

function updateSwipeTracking(clientX: number, clientY: number) {
  if (pointerStartX.value === null || pointerStartY.value === null || !swiping.value) {
    return;
  }

  const deltaX = clientX - pointerStartX.value;
  const deltaY = Math.abs(clientY - pointerStartY.value);
  if (Math.abs(deltaX) > 8 || deltaY > 8) cancelLongPress();
  if (deltaY > 56) {
    swipeOffset.value = 0;
    return;
  }

  swipeOffset.value = Math.max(-58, Math.min(58, deltaX));
}

function finishSwipeTracking(clientX: number, clientY: number) {
  cancelLongPress();
  if (pointerStartX.value === null || pointerStartY.value === null || !swiping.value) {
    resetSwipeTracking();
    return;
  }

  const deltaX = clientX - pointerStartX.value;
  const deltaY = Math.abs(clientY - pointerStartY.value);
  resetSwipeTracking();

  if (Math.abs(deltaX) > 44 && deltaY < 46) {
    emit("reply", props.message);
  }
}

function handlePointerDown(clientX: number, clientY: number) {
  startSwipeTracking(clientX, clientY);
  scheduleLongPress();
}

function jumpToReply() {
  if (props.message.replyTo) {
    emit("jump-reply", props.message.replyTo.id);
  }
}

function handleTouchStart(event: TouchEvent) {
  const touch = event.changedTouches[0];
  if (touch) {
    startSwipeTracking(touch.clientX, touch.clientY);
    scheduleLongPress();
  }
}

function handleTouchMove(event: TouchEvent) {
  const touch = event.changedTouches[0];
  if (touch) updateSwipeTracking(touch.clientX, touch.clientY);
}

function handleTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0];
  if (touch) finishSwipeTracking(touch.clientX, touch.clientY);
}

onBeforeUnmount(cancelLongPress);
</script>

<template>
  <article
    :id="`chat-message-${message.id}`"
    class="chat-message"
    :class="{
      'opacity-55': message.status !== 'visible',
      'chat-message-system': message.isSystem,
      'chat-message-own': !message.isSystem && ownMessage,
      'chat-message-reply-to-me': !message.isSystem && replyToViewer,
      'chat-message-swiping': swiping,
      'chat-message-jump-highlight': highlighted,
      'chat-message-grouped-previous': groupedWithPrevious,
      'chat-message-grouped-next': groupedWithNext,
      'chat-message-delivery-failed': deliveryState === 'failed'
    }"
    :style="swiping ? { transform: `translateX(${swipeOffset}px)` } : undefined"
    @pointerdown="handlePointerDown($event.clientX, $event.clientY)"
    @pointermove="updateSwipeTracking($event.clientX, $event.clientY)"
    @pointerup="finishSwipeTracking($event.clientX, $event.clientY)"
    @pointercancel="cancelLongPress(); resetSwipeTracking()"
    @touchstart.passive="handleTouchStart"
    @touchmove.passive="handleTouchMove"
    @touchend.passive="handleTouchEnd"
    @touchcancel.passive="cancelLongPress(); resetSwipeTracking()"
  >
    <span
      v-if="!message.isSystem && swiping && Math.abs(swipeOffset) > 10"
      class="swipe-reply-cue"
      :class="`swipe-reply-cue-${swipeOffset < 0 ? 'left' : 'right'}`"
    >
      ↩
    </span>
    <div
      v-if="!message.isSystem && !ownMessage"
      class="chat-avatar"
      :class="{ 'chat-avatar-placeholder': groupedWithNext }"
    >
      <template v-if="!groupedWithNext">
        <img
          v-if="photoUrl"
          :src="photoUrl"
          :alt="authorName(message)"
          :style="avatarStyle"
          loading="lazy"
          decoding="async"
        />
        <span v-else>{{ authorInitial(message) }}</span>
      </template>
    </div>
    <div v-if="!message.isSystem" class="chat-message-content">
      <div class="chat-bubble">
        <div class="chat-message-head">
          <span v-if="!groupedWithPrevious" class="chat-message-author">{{ authorName(message) }}</span>
          <span v-if="isModerator && message.authorMute" class="mute-inline-badge">Мут</span>
          <time>{{ formatMessageTime(message.createdAt) }}</time>
          <button
            v-if="!message.isSystem && !memberTombstone"
            class="chat-message-moderation-trigger"
            type="button"
            :aria-label="`Действия с сообщением ${authorName(message)}`"
            @pointerdown.stop
            @touchstart.stop
            @click.stop="$emit('open-actions', message)"
          >
            <MoreVertical class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div
          v-if="message.replyTo && !memberTombstone"
          class="reply-preview"
          role="button"
          tabindex="0"
          :aria-label="`Перейти к сообщению ${resolveDisplayName(message.replyTo.author)}`"
          @click.stop="jumpToReply"
          @keydown.enter.stop.prevent="jumpToReply"
          @keydown.space.stop.prevent="jumpToReply"
        >
          <span>{{ resolveDisplayName(message.replyTo.author) }}</span>
          <span>{{ message.replyTo.body }}</span>
        </div>
        <p v-if="memberTombstone" class="chat-message-body chat-message-tombstone">Сообщение удалено</p>
        <p v-else-if="message.kind === 'text'" class="chat-message-body">
          <span
            v-for="(segment, index) in textSegments"
            :key="`${index}:${segment.text}`"
            :class="{ 'chat-message-mention': segment.mention }"
          >{{ segment.text }}</span>
        </p>
        <ChatVoiceMessage v-else-if="message.kind === 'voice' && message.voice" :voice="message.voice" />
        <ChatImageGallery v-else-if="message.kind === 'images'" :images="message.images" />
        <ChatFileMessage v-else-if="message.kind === 'video' && message.video" kind="video" :attachment="message.video" :refresh-url="() => refreshMessageAttachment(message.video!.id)" />
        <ChatFileMessage v-else-if="message.kind === 'document' && message.document" kind="document" :attachment="message.document" :refresh-url="() => refreshMessageAttachment(message.document!.id)" />
        <ChatPollMessage
          v-else-if="message.kind === 'poll' && message.poll"
          :poll="message.poll"
          :moderator="isModerator"
          :disabled="messageSaving"
          @vote="$emit('poll-vote', message, $event)"
          @close="$emit('poll-close', message)"
        />
        <span v-if="message.pinnedAt && !memberTombstone" class="chat-message-pinned">
          <Pin class="h-3 w-3" aria-hidden="true" /> Закреплено
        </span>
        <p v-if="message.status !== 'visible'" class="mt-1 text-[0.68rem] text-[var(--danger)]">
          {{ message.status === "deleted" ? "Удалено" : "Скрыто" }}
        </p>
        <p v-if="isModerator && message.deletedByUserAt" class="chat-message-original-marker">
          Удалено пользователем · оригинал виден модератору
        </p>
        <div
          v-if="!message.isSystem && (message.editedAt || ownMessage || deliveryState === 'sending' || deliveryState === 'failed')"
          class="chat-message-delivery"
          aria-live="polite"
        >
          <span v-if="message.editedAt" class="chat-message-edited">изменено</span>
          <span v-if="deliveryState === 'sending'" aria-label="Отправляется">
            <Clock3 aria-hidden="true" /> Отправляется…
          </span>
          <span v-else-if="deliveryState === 'failed'" class="chat-message-failed">Не отправлено</span>
          <span v-else-if="ownMessage" class="chat-message-sent" aria-label="Отправлено">
            <CheckCheck aria-hidden="true" />
          </span>
          <button
            v-if="deliveryState === 'failed'"
            type="button"
            aria-label="Повторить отправку"
            @pointerdown.stop
            @touchstart.stop
            @click.stop="$emit('retry', message)"
          >
            <RefreshCw aria-hidden="true" /> Повторить
          </button>
        </div>
      </div>
      <div v-if="reactions.length && !memberTombstone" class="message-reactions">
        <button
          v-for="reaction in reactions"
          :key="reaction.reaction"
          class="message-reaction-button"
          :class="{ 'message-reaction-active': message.myReaction === reaction.reaction }"
          type="button"
          @click.stop="$emit('react', message, reaction.reaction)"
        >
          <span>{{ reactionLabel(reaction.reaction) }}</span>
          <small>{{ reaction.count }}</small>
        </button>
      </div>
    </div>
    <div
      v-if="!message.isSystem && ownMessage"
      class="chat-avatar"
      :class="{ 'chat-avatar-placeholder': groupedWithNext }"
    >
      <template v-if="!groupedWithNext">
        <img
          v-if="photoUrl"
          :src="photoUrl"
          :alt="authorName(message)"
          :style="avatarStyle"
          loading="lazy"
          decoding="async"
        />
        <span v-else>{{ authorInitial(message) }}</span>
      </template>
    </div>
    <p v-if="message.isSystem" class="chat-system-body">
      <span>{{ message.body }}</span>
      <time>{{ formatMessageTime(message.createdAt) }}</time>
    </p>
  </article>
</template>
