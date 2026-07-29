<script setup lang="ts">
import type { ClubMessage, ClubTopic, CommunityNotificationMode } from "@club/shared";
import { ArrowDown, ArrowLeft, ChevronDown, MoreVertical, Pin, Search } from "lucide-vue-next";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "@/features/app/i18n";
import ChatComposer from "./ChatComposer.vue";
import ChatMessage from "./ChatMessage.vue";
import ChatModerationMenu from "./ChatModerationMenu.vue";
import {
  authorName,
  formatMessageTime,
  isUnreadCandidate,
  reactionOptions,
  type ChatComposerEventMap,
  type ChatMessageEventMap,
  type CommunityViewer,
} from "./communityViewModel";

const props = defineProps<{
  topic: ClubTopic;
  messages: ClubMessage[];
  initialUnreadCount?: number;
  messagesNextCursor: string | null;
  loadingOlderMessages: boolean;
  messageSaving: boolean;
  notificationSaving?: boolean;
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
  interactionResetVersion: number;
  activeModerationMessage: ClubMessage | null;
  backgroundInert?: boolean;
}>();

const emit = defineEmits<{
  back: [];
  "toggle-topic-lock": [];
  "delete-topic-messages": [];
  "open-search": [trigger: HTMLElement];
  "update-notification-mode": [mode: CommunityNotificationMode];
  "load-older-messages": [];
  reply: ChatMessageEventMap["reply"];
  react: ChatMessageEventMap["react"];
  "open-actions": ChatMessageEventMap["open-actions"];
  "poll-vote": ChatMessageEventMap["poll-vote"];
  "poll-close": ChatMessageEventMap["poll-close"];
  "send-text": ChatComposerEventMap["send-text"];
  "send-voice": ChatComposerEventMap["send-voice"];
  "send-files": ChatComposerEventMap["send-files"];
  "create-poll": ChatComposerEventMap["create-poll"];
  "draft-change": ChatComposerEventMap["draft-change"];
  "cancel-reply": ChatComposerEventMap["cancel-reply"];
  "close-actions": [];
  "toggle-pin": [message: ClubMessage];
  "toggle-status": [message: ClubMessage, status: "visible" | "hidden" | "deleted"];
  mute: [message: ClubMessage];
  "revoke-mute": [message: ClubMessage];
  "delete-author-messages": [message: ClubMessage];
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
const firstUnreadMessageId = computed(() => {
  const eligibleMessages = orderedMessages.value.filter((message) => isUnreadCandidate(message, props.viewer));
  if (props.messagesNextCursor && (props.initialUnreadCount ?? 0) > eligibleMessages.length) return null;
  const count = Math.min(props.initialUnreadCount ?? 0, eligibleMessages.length);
  return count > 0 ? eligibleMessages[eligibleMessages.length - count]?.id ?? null : null;
});
const pendingIncomingMessageIds = ref<string[]>([]);
const isAwayFromBottom = ref(false);
const jumpMessageId = computed(() =>
  orderedMessages.value.find((message) => pendingIncomingMessageIds.value.includes(message.id))?.id ?? null
);
const showJumpButton = computed(() => Boolean(jumpMessageId.value) || isAwayFromBottom.value);
let unreadPositionedTopicId: string | null = null;
let observedTopicId = props.topic.id;
let knownMessageIds = new Set(props.messages.map((message) => message.id));
let latestKnownMessageKey = props.messages.reduce((latest, message) => {
  const key = `${message.createdAt}\u001f${message.id}`;
  return key > latest ? key : latest;
}, "");

function isNearMessagesBottom() {
  const element = messagesList.value;
  return !element || element.scrollHeight - element.scrollTop - element.clientHeight < 96;
}

function handleMessagesScroll() {
  isAwayFromBottom.value = !isNearMessagesBottom();
  const targetId = jumpMessageId.value;
  const element = messagesList.value;
  if (!targetId || !element) return;
  const target = document.getElementById(`chat-message-${targetId}`);
  if (isNearMessagesBottom() || (target && target.getBoundingClientRect().top <= element.getBoundingClientRect().bottom)) {
    pendingIncomingMessageIds.value = [];
  }
}

function jumpToIncomingMessages() {
  const targetId = jumpMessageId.value;
  if (!targetId) {
    void scrollToBottom();
    return;
  }
  pendingIncomingMessageIds.value = [];
  scrollToMessage(targetId);
}

async function scrollToBottom() {
  await nextTick();
  messagesEnd.value?.scrollIntoView({ block: "end" });
  isAwayFromBottom.value = false;
}

function getMessagesElement() {
  return messagesList.value;
}

function scrollToMessage(messageId: string, behavior: ScrollBehavior = "smooth") {
  showPinnedMessages.value = false;
  highlightedMessageId.value = messageId;
  isAwayFromBottom.value = messageId !== orderedMessages.value.at(-1)?.id;
  if (messageHighlightTimer) globalThis.clearTimeout(messageHighlightTimer);
  const resolvedBehavior = behavior === "smooth" && globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : behavior;
  nextTick(() => document.getElementById(`chat-message-${messageId}`)?.scrollIntoView?.({ behavior: resolvedBehavior, block: "center" }));
  messageHighlightTimer = globalThis.setTimeout(() => {
    if (highlightedMessageId.value === messageId) highlightedMessageId.value = null;
    messageHighlightTimer = null;
  }, 1_800);
}

function toggleReactionPicker(message: ClubMessage) {
  activeReactionMessageId.value = activeReactionMessageId.value === message.id ? null : message.id;
}

function handleReaction(message: ClubMessage, reaction: ChatMessageEventMap["react"][1]) {
  emit("react", message, reaction);
}

function handleReply(message: ClubMessage) {
  activeReactionMessageId.value = null;
  emit("reply", message);
}

function handleTopicLock() {
  showTopicAdminMenu.value = false;
  emit("toggle-topic-lock");
}

function handleDeleteTopicMessages() {
  showTopicAdminMenu.value = false;
  emit("delete-topic-messages");
}

function openSearch(event: MouseEvent) {
  emit("open-search", event.currentTarget as HTMLElement);
}

function resetLocalInteractions() {
  showTopicAdminMenu.value = false;
  showPinnedMessages.value = false;
  activeReactionMessageId.value = null;
  highlightedMessageId.value = null;
}

watch(() => props.topic.id, resetLocalInteractions);
watch(
  () => `${props.topic.id}\u001e${props.messages.map((message) => message.id).join("\u001f")}`,
  () => {
    if (props.topic.id !== observedTopicId) {
      observedTopicId = props.topic.id;
      knownMessageIds = new Set(props.messages.map((message) => message.id));
      latestKnownMessageKey = props.messages.reduce((latest, message) => {
        const key = `${message.createdAt}\u001f${message.id}`;
        return key > latest ? key : latest;
      }, "");
      pendingIncomingMessageIds.value = [];
      return;
    }

    const additions = props.messages.filter((message) => !knownMessageIds.has(message.id));
    const incoming = additions.filter((message) => {
      const key = `${message.createdAt}\u001f${message.id}`;
      return key > latestKnownMessageKey && isUnreadCandidate(message, props.viewer);
    });
    knownMessageIds = new Set(props.messages.map((message) => message.id));
    for (const message of additions) {
      const key = `${message.createdAt}\u001f${message.id}`;
      if (key > latestKnownMessageKey) latestKnownMessageKey = key;
    }
    if (!incoming.length || isNearMessagesBottom()) return;
    pendingIncomingMessageIds.value = [...new Set([
      ...pendingIncomingMessageIds.value,
      ...incoming.map((message) => message.id)
    ])];
    isAwayFromBottom.value = true;
  }
);
watch(
  [() => props.topic.id, firstUnreadMessageId],
  async ([topicId, messageId]) => {
    if (!messageId || unreadPositionedTopicId === topicId) return;
    unreadPositionedTopicId = topicId;
    await nextTick();
    scrollToMessage(messageId, "auto");
  },
  { immediate: true }
);
watch(() => props.interactionResetVersion, resetLocalInteractions);
watch(() => props.reactionCompletedVersion, () => {
  activeReactionMessageId.value = null;
});

onBeforeUnmount(() => {
  if (messageHighlightTimer) globalThis.clearTimeout(messageHighlightTimer);
});

defineExpose({ getMessagesElement, scrollToBottom, scrollToMessage });
</script>

<template>
  <div class="chat-room" :inert="backgroundInert || undefined" :aria-hidden="backgroundInert ? 'true' : undefined">
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
      <button class="icon-button ui-icon-button" type="button" aria-label="Поиск сообщений" @click="openSearch">
        <Search class="h-4 w-4" aria-hidden="true" />
      </button>
      <div class="chat-room-admin">
        <button
          class="icon-button ui-icon-button"
          type="button"
          aria-label="Меню чата"
          @click="showTopicAdminMenu = !showTopicAdminMenu"
        >
          <MoreVertical class="h-4 w-4" aria-hidden="true" />
        </button>
        <div v-if="showTopicAdminMenu" class="chat-admin-menu">
          <fieldset class="chat-notification-settings" :disabled="notificationSaving">
            <legend>Уведомления</legend>
            <label>
              <input type="radio" name="chat-notification-mode" value="all" :checked="topic.notificationMode === 'all'" @change="$emit('update-notification-mode', 'all')" />
              <span>Все сообщения</span>
            </label>
            <label>
              <input type="radio" name="chat-notification-mode" value="mentions" :checked="topic.notificationMode === 'mentions'" @change="$emit('update-notification-mode', 'mentions')" />
              <span>Только упоминания</span>
            </label>
            <label>
              <input type="radio" name="chat-notification-mode" value="off" :checked="topic.notificationMode === 'off'" @change="$emit('update-notification-mode', 'off')" />
              <span>Выключены</span>
            </label>
          </fieldset>
          <button v-if="isModerator" class="mini-action" type="button" @click="handleTopicLock">
            {{ topic.isLocked ? "Открыть чат" : "Закрыть чат" }}
          </button>
          <button v-if="isModerator" class="mini-action danger-action" type="button" @click="handleDeleteTopicMessages">
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

    <div ref="messagesList" class="chat-messages" @scroll.passive="handleMessagesScroll">
      <button
        v-if="messagesNextCursor"
        class="mx-auto mb-3 min-h-10 rounded-full border border-[var(--line)] px-4 text-xs font-semibold text-[var(--muted)]"
        type="button"
        :disabled="loadingOlderMessages"
        @click="$emit('load-older-messages')"
      >
        {{ loadingOlderMessages ? "Загрузка…" : "Показать предыдущие сообщения" }}
      </button>
      <p v-if="!messages.length" class="py-6 text-center text-xs text-[var(--muted)]">{{ t("messagesEmpty") }}</p>
      <template v-for="message in orderedMessages" :key="message.id">
        <div v-if="message.id === firstUnreadMessageId" class="chat-new-messages-divider" role="separator">
          <span>Новые сообщения</span>
        </div>
        <ChatMessage
          :message="message"
          :viewer="viewer"
          :is-moderator="isModerator"
          :message-saving="messageSaving"
          :highlighted="highlightedMessageId === message.id"
          @reply="handleReply"
          @react="handleReaction"
          @open-actions="$emit('open-actions', $event)"
          @jump-reply="scrollToMessage"
          @poll-vote="(message, optionIds) => $emit('poll-vote', message, optionIds)"
          @poll-close="$emit('poll-close', $event)"
          @toggle-reactions="toggleReactionPicker"
        />
      </template>
      <div ref="messagesEnd"></div>
    </div>

    <button
      v-if="showJumpButton"
      class="chat-jump-new-button"
      type="button"
      aria-label="Перейти к новым сообщениям"
      @click="jumpToIncomingMessages"
    >
      <ArrowDown class="h-4 w-4" aria-hidden="true" />
      <span v-if="pendingIncomingMessageIds.length">{{ pendingIncomingMessageIds.length }}</span>
    </button>

    <ChatComposer
      :can-write="canWrite"
      :is-muted="isMuted"
      :mute-composer-text="muteComposerText"
      :unavailable-composer-text="unavailableComposerText"
      :message-saving="messageSaving"
      :reply-to-message="replyToMessage"
      :draft="draft"
      :reset-version="composerResetVersion"
      @send-text="$emit('send-text', $event)"
      @send-voice="(blob, durationSeconds) => $emit('send-voice', blob, durationSeconds)"
      @send-files="$emit('send-files', $event)"
      @create-poll="$emit('create-poll', $event)"
      @draft-change="$emit('draft-change', $event)"
      @cancel-reply="$emit('cancel-reply')"
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
    @close="$emit('close-actions')"
    @toggle-pin="$emit('toggle-pin', $event)"
    @toggle-status="(message, status) => $emit('toggle-status', message, status)"
    @mute="$emit('mute', $event)"
    @revoke-mute="$emit('revoke-mute', $event)"
    @delete-author-messages="$emit('delete-author-messages', $event)"
  />
</template>
