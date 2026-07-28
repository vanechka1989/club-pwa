<script setup lang="ts">
import { resolveDisplayName, type ClubMessage } from "@club/shared";
import { MoreVertical, Pin } from "lucide-vue-next";
import { computed, ref } from "vue";
import ChatImageGallery from "./ChatImageGallery.vue";
import ChatPollMessage from "./ChatPollMessage.vue";
import ChatVoiceMessage from "./ChatVoiceMessage.vue";
import {
  authorInitial,
  authorName,
  formatMessageTime,
  isOwnMessage,
  isReplyToViewer,
  messageAuthorAvatarStyle,
  messageAuthorPhotoUrl,
  reactionLabel,
  visibleReactionCounts,
  type ChatMessageEventMap,
  type CommunityViewer,
} from "./communityViewModel";

const props = defineProps<{
  message: ClubMessage;
  viewer: CommunityViewer | null;
  isModerator: boolean;
  messageSaving: boolean;
  highlighted: boolean;
}>();

const emit = defineEmits<ChatMessageEventMap>();

const pointerStartX = ref<number | null>(null);
const pointerStartY = ref<number | null>(null);
const swipeOffset = ref(0);
const swiping = ref(false);
const suppressNextMessageClick = ref(false);

const ownMessage = computed(() => isOwnMessage(props.message, props.viewer));
const replyToViewer = computed(() => isReplyToViewer(props.message, props.viewer));
const photoUrl = computed(() => messageAuthorPhotoUrl(props.message, props.viewer));
const avatarStyle = computed(() => messageAuthorAvatarStyle(props.message, props.viewer));
const reactions = computed(() => visibleReactionCounts(props.message));

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
  if (deltaY > 56) {
    swipeOffset.value = 0;
    return;
  }

  swipeOffset.value = Math.max(-58, Math.min(58, deltaX));
}

function finishSwipeTracking(clientX: number, clientY: number) {
  if (pointerStartX.value === null || pointerStartY.value === null || !swiping.value) {
    resetSwipeTracking();
    return;
  }

  const deltaX = clientX - pointerStartX.value;
  const deltaY = Math.abs(clientY - pointerStartY.value);
  resetSwipeTracking();

  if (Math.abs(deltaX) > 44 && deltaY < 46) {
    emit("reply", props.message);
    suppressNextMessageClick.value = true;
    window.setTimeout(() => {
      suppressNextMessageClick.value = false;
    }, 250);
  }
}

function handleMessageClick() {
  if (props.message.isSystem || suppressNextMessageClick.value) {
    return;
  }

  emit("toggle-reactions", props.message);
}

function jumpToReply() {
  if (props.message.replyTo) {
    emit("jump-reply", props.message.replyTo.id);
  }
}

function handleTouchStart(event: TouchEvent) {
  const touch = event.changedTouches[0];
  if (touch) startSwipeTracking(touch.clientX, touch.clientY);
}

function handleTouchMove(event: TouchEvent) {
  const touch = event.changedTouches[0];
  if (touch) updateSwipeTracking(touch.clientX, touch.clientY);
}

function handleTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0];
  if (touch) finishSwipeTracking(touch.clientX, touch.clientY);
}
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
      'chat-message-jump-highlight': highlighted
    }"
    :style="swiping ? { transform: `translateX(${swipeOffset}px)` } : undefined"
    @pointerdown="startSwipeTracking($event.clientX, $event.clientY)"
    @pointermove="updateSwipeTracking($event.clientX, $event.clientY)"
    @pointerup="finishSwipeTracking($event.clientX, $event.clientY)"
    @pointercancel="resetSwipeTracking"
    @touchstart.passive="handleTouchStart"
    @touchmove.passive="handleTouchMove"
    @touchend.passive="handleTouchEnd"
    @touchcancel.passive="resetSwipeTracking"
    @click="handleMessageClick"
  >
    <span
      v-if="!message.isSystem && swiping && Math.abs(swipeOffset) > 10"
      class="swipe-reply-cue"
      :class="`swipe-reply-cue-${swipeOffset < 0 ? 'left' : 'right'}`"
    >
      ↩
    </span>
    <div v-if="!message.isSystem && !ownMessage" class="chat-avatar">
      <img
        v-if="photoUrl"
        :src="photoUrl"
        :alt="authorName(message)"
        :style="avatarStyle"
        loading="lazy"
        decoding="async"
      />
      <span v-else>{{ authorInitial(message) }}</span>
    </div>
    <div v-if="!message.isSystem" class="chat-message-content">
      <div class="chat-bubble">
        <div class="chat-message-head">
          <span class="chat-message-author">{{ authorName(message) }}</span>
          <span v-if="isModerator && message.authorMute" class="mute-inline-badge">Мут</span>
          <time>{{ formatMessageTime(message.createdAt) }}</time>
          <button
            v-if="isModerator"
            class="chat-message-moderation-trigger"
            type="button"
            :aria-label="`Действия с сообщением пользователя ${authorName(message)}`"
            @click.stop="$emit('open-actions', message)"
          >
            <MoreVertical class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div
          v-if="message.replyTo"
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
        <p v-if="message.kind === 'text'" class="chat-message-body">{{ message.body }}</p>
        <ChatVoiceMessage v-else-if="message.kind === 'voice' && message.voice" :voice="message.voice" />
        <ChatImageGallery v-else-if="message.kind === 'images'" :images="message.images" />
        <ChatPollMessage
          v-else-if="message.kind === 'poll' && message.poll"
          :poll="message.poll"
          :moderator="isModerator"
          :disabled="messageSaving"
          @vote="$emit('poll-vote', message, $event)"
          @close="$emit('poll-close', message)"
        />
        <span v-if="message.pinnedAt" class="chat-message-pinned">
          <Pin class="h-3 w-3" aria-hidden="true" /> Закреплено
        </span>
        <p v-if="message.status !== 'visible'" class="mt-1 text-[0.68rem] text-[var(--danger)]">
          {{ message.status === "deleted" ? "Удалено" : "Скрыто" }}
        </p>
      </div>
      <div v-if="reactions.length" class="message-reactions">
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
    <div v-if="!message.isSystem && ownMessage" class="chat-avatar">
      <img
        v-if="photoUrl"
        :src="photoUrl"
        :alt="authorName(message)"
        :style="avatarStyle"
        loading="lazy"
        decoding="async"
      />
      <span v-else>{{ authorInitial(message) }}</span>
    </div>
    <p v-if="message.isSystem" class="chat-system-body">
      <span>{{ message.body }}</span>
      <time>{{ formatMessageTime(message.createdAt) }}</time>
    </p>
  </article>
</template>
