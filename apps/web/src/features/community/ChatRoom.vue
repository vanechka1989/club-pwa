<script setup lang="ts">
import type { ClubMessage, ClubTopic } from "@club/shared";
import { ArrowLeft, ChevronDown, MoreVertical, Pin } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "@/features/app/i18n";
import ChatComposer from "./ChatComposer.vue";
import ChatMessage from "./ChatMessage.vue";
import ChatModerationMenu from "./ChatModerationMenu.vue";
import {
  authorName,
  formatMessageTime,
  reactionOptions,
  type ChatPollDraft,
  type CommunityViewer,
  type VisibleMessageReaction
} from "./communityViewModel";

const props = defineProps<{
  topic: ClubTopic;
  messages: ClubMessage[];
  messagesNextCursor: string | null;
  loadingOlderMessages: boolean;
  messageSaving: boolean;
  communityError: string | null;
  isModerator: boolean;
  viewer: CommunityViewer | null;
  canWrite: boolean;
  isMuted: boolean;
  muteComposerText: string;
  unavailableComposerText: string;
  replyToMessage: ClubMessage | null;
  draft: string;
  composerResetVersion: number;
  reactionCompletedVersion: number;
  activeModerationMessage: ClubMessage | null;
}>();

const emit = defineEmits<{
  back: [];
  toggleTopicLock: [];
  deleteTopicMessages: [];
  loadOlderMessages: [];
  reply: [message: ClubMessage];
  react: [message: ClubMessage, reaction: VisibleMessageReaction];
  openActions: [message: ClubMessage];
  pollVote: [message: ClubMessage, optionIds: string[]];
  pollClose: [message: ClubMessage];
  sendText: [body: string];
  sendVoice: [blob: Blob, durationSeconds: number];
  sendFiles: [files: File[]];
  createPoll: [payload: ChatPollDraft];
  draftChange: [body: string];
  cancelReply: [];
  closeActions: [];
  togglePin: [message: ClubMessage];
  toggleStatus: [message: ClubMessage, status: "visible" | "hidden" | "deleted"];
  mute: [message: ClubMessage];
  revokeMute: [message: ClubMessage];
  deleteAuthorMessages: [message: ClubMessage];
}>();

const { t } = useI18n();
const messagesList = ref<HTMLElement | null>(null);
const messagesEnd = ref<HTMLElement | null>(null);
const showTopicAdminMenu = ref(false);
const showPinnedMessages = ref(false);
const activeReactionMessageId = ref<string | null>(null);
const highlightedMessageId = ref<string | null>(null);
let messageHighlightTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

const orderedMessages = computed(() => [...props.messages].reverse());
const pinnedMessages = computed(() =>
  orderedMessages.value.filter((message) => Boolean(message.pinnedAt) && message.status === "visible" && !message.isSystem)
);
const latestPinnedMessage = computed(() => pinnedMessages.value.at(-1) ?? null);
const activeReactionMessage = computed(
  () => orderedMessages.value.find((message) => message.id === activeReactionMessageId.value) ?? null
);

async function scrollToBottom() {
  await nextTick();
  messagesEnd.value?.scrollIntoView({ block: "end" });
}

function getMessagesElement() {
  return messagesList.value;
}

function scrollToMessage(messageId: string) {
  showPinnedMessages.value = false;
  highlightedMessageId.value = messageId;
  if (messageHighlightTimer) globalThis.clearTimeout(messageHighlightTimer);
  nextTick(() => document.getElementById(`chat-message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  messageHighlightTimer = globalThis.setTimeout(() => {
    if (highlightedMessageId.value === messageId) highlightedMessageId.value = null;
    messageHighlightTimer = null;
  }, 1_800);
}

function toggleReactionPicker(message: ClubMessage) {
  activeReactionMessageId.value = activeReactionMessageId.value === message.id ? null : message.id;
}

function handleReaction(message: ClubMessage, reaction: VisibleMessageReaction) {
  emit("react", message, reaction);
}

function handleReply(message: ClubMessage) {
  activeReactionMessageId.value = null;
  emit("reply", message);
}

function handleTopicLock() {
  showTopicAdminMenu.value = false;
  emit("toggleTopicLock");
}

function handleDeleteTopicMessages() {
  showTopicAdminMenu.value = false;
  emit("deleteTopicMessages");
}

watch(
  () => props.topic.id,
  () => {
    showTopicAdminMenu.value = false;
    showPinnedMessages.value = false;
    activeReactionMessageId.value = null;
    highlightedMessageId.value = null;
  }
);
watch(() => props.reactionCompletedVersion, () => {
  activeReactionMessageId.value = null;
});

onBeforeUnmount(() => {
  if (messageHighlightTimer) globalThis.clearTimeout(messageHighlightTimer);
});

defineExpose({ getMessagesElement, scrollToBottom });
</script>

<template>
  <div class="chat-room">
    <header class="chat-room-header">
      <button class="icon-button ui-icon-button" type="button" aria-label="Назад" @click="$emit('back')">
        <ArrowLeft class="h-4 w-4" aria-hidden="true" />
      </button>
      <div class="min-w-0 flex-1">
        <h2 class="chat-room-header-title">{{ topic.title }}</h2>
        <p class="chat-room-header-subtitle">
          {{ topic.isAdminOnly ? t("communityAdminOnlyRoom") : topic.isLocked ? "Тема закрыта" : "Открытый чат" }}
        </p>
      </div>
      <div v-if="isModerator" class="chat-room-admin">
        <button
          class="icon-button ui-icon-button"
          type="button"
          aria-label="Меню чата"
          @click="showTopicAdminMenu = !showTopicAdminMenu"
        >
          <MoreVertical class="h-4 w-4" aria-hidden="true" />
        </button>
        <div v-if="showTopicAdminMenu" class="chat-admin-menu">
          <button class="mini-action" type="button" @click="handleTopicLock">
            {{ topic.isLocked ? "Открыть чат" : "Закрыть чат" }}
          </button>
          <button class="mini-action danger-action" type="button" @click="handleDeleteTopicMessages">
            Удалить все сообщения
          </button>
        </div>
      </div>
    </header>

    <div class="chat-room-notices">
      <div v-if="pinnedMessages.length" class="chat-pinned-bar">
        <button
          class="chat-pinned-toggle"
          type="button"
          :aria-expanded="showPinnedMessages"
          aria-controls="chat-pinned-details"
          aria-label="Показать или скрыть закреплённые сообщения"
          @click="showPinnedMessages = !showPinnedMessages"
        >
          <Pin class="h-4 w-4" aria-hidden="true" />
          <strong>Закреплено</strong>
          <em>{{ pinnedMessages.length }}</em>
          <ChevronDown
            class="chat-pinned-toggle-icon h-4 w-4"
            :class="{ 'chat-pinned-toggle-icon-open': showPinnedMessages }"
            aria-hidden="true"
          />
        </button>
        <div v-if="showPinnedMessages" id="chat-pinned-details" class="chat-pinned-details">
          <button v-if="latestPinnedMessage" class="chat-pinned-current" type="button" @click="scrollToMessage(latestPinnedMessage.id)">
            <Pin class="h-4 w-4" aria-hidden="true" />
            <span>
              <strong>{{ authorName(latestPinnedMessage) }}</strong>
              <small>{{ latestPinnedMessage.body }}</small>
              <time>{{ formatMessageTime(latestPinnedMessage.createdAt) }}</time>
            </span>
          </button>
          <div class="chat-pinned-list">
            <button v-for="message in pinnedMessages" :key="message.id" type="button" @click="scrollToMessage(message.id)">
              <span class="chat-pinned-list-meta">
                <strong>{{ authorName(message) }}</strong>
                <time>{{ formatMessageTime(message.createdAt) }}</time>
              </span>
              <span>{{ message.body }}</span>
            </button>
          </div>
        </div>
      </div>
      <p v-if="communityError" class="px-1 text-xs text-[var(--danger)]">{{ communityError }}</p>
    </div>

    <div ref="messagesList" class="chat-messages">
      <button
        v-if="messagesNextCursor"
        class="mx-auto mb-3 min-h-10 rounded-full border border-[var(--line)] px-4 text-xs font-semibold text-[var(--muted)]"
        type="button"
        :disabled="loadingOlderMessages"
        @click="$emit('loadOlderMessages')"
      >
        {{ loadingOlderMessages ? "Загрузка…" : "Показать предыдущие сообщения" }}
      </button>
      <p v-if="!messages.length" class="py-6 text-center text-xs text-[var(--muted)]">{{ t("messagesEmpty") }}</p>
      <ChatMessage
        v-for="message in orderedMessages"
        :key="message.id"
        :message="message"
        :viewer="viewer"
        :is-moderator="isModerator"
        :message-saving="messageSaving"
        :highlighted="highlightedMessageId === message.id"
        @reply="handleReply"
        @react="handleReaction"
        @open-actions="$emit('openActions', $event)"
        @jump-reply="scrollToMessage"
        @poll-vote="(message, optionIds) => $emit('pollVote', message, optionIds)"
        @poll-close="$emit('pollClose', $event)"
        @toggle-reactions="toggleReactionPicker"
      />
      <div ref="messagesEnd"></div>
    </div>

    <ChatComposer
      :can-write="canWrite"
      :is-muted="isMuted"
      :mute-composer-text="muteComposerText"
      :unavailable-composer-text="unavailableComposerText"
      :message-saving="messageSaving"
      :reply-to-message="replyToMessage"
      :draft="draft"
      :reset-version="composerResetVersion"
      @send-text="$emit('sendText', $event)"
      @send-voice="(blob, durationSeconds) => $emit('sendVoice', blob, durationSeconds)"
      @send-files="$emit('sendFiles', $event)"
      @create-poll="$emit('createPoll', $event)"
      @draft-change="$emit('draftChange', $event)"
      @cancel-reply="$emit('cancelReply')"
    />
  </div>

  <Teleport to="body">
    <div
      v-if="activeReactionMessage"
      class="reaction-popover community-reaction-popover"
      role="dialog"
      aria-label="Выберите реакцию"
      @click.stop
    >
      <button
        v-for="option in reactionOptions"
        :key="option.value"
        class="reaction-popover-button"
        :class="{ 'message-reaction-active': activeReactionMessage.myReaction === option.value }"
        type="button"
        :aria-label="`Поставить реакцию ${option.label}`"
        @click="handleReaction(activeReactionMessage, option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </Teleport>

  <ChatModerationMenu
    v-if="isModerator && activeModerationMessage"
    :message="activeModerationMessage"
    @close="$emit('closeActions')"
    @toggle-pin="$emit('togglePin', $event)"
    @toggle-status="(message, status) => $emit('toggleStatus', message, status)"
    @mute="$emit('mute', $event)"
    @revoke-mute="$emit('revokeMute', $event)"
    @delete-author-messages="$emit('deleteAuthorMessages', $event)"
  />
</template>
