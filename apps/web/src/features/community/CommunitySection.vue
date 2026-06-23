<script setup lang="ts">
import type { ClubMessage, ClubTopic } from "@club/shared";
import { ArrowLeft, Lock, MessageCircle, Plus, Reply, Send, Smile, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-vue-next";
import { computed, nextTick, onMounted, ref } from "vue";
import {
  createClubMessage,
  createCommunityTopic,
  createUserMute,
  getClubMessages,
  getCommunityTopics,
  reactToClubMessage,
  updateClubTopicSettings,
  updateModerationStatus
} from "@/api/client";
import { useI18n } from "@/features/app/i18n";
import { useSessionStore } from "@/stores/session";

const { t } = useI18n();
const session = useSessionStore();

const topics = ref<ClubTopic[]>([]);
const messages = ref<ClubMessage[]>([]);
const selectedTopic = ref<ClubTopic | null>(null);
const loading = ref(false);
const mutedUntil = ref<string | null>(null);
const mutedPermanently = ref(false);
const newMessage = ref("");
const newTopicTitle = ref("");
const showCreateTopic = ref(false);
const replyToMessage = ref<ClubMessage | null>(null);
const activeModerationMessageId = ref<string | null>(null);
const pointerStartX = ref<number | null>(null);
const pointerStartY = ref<number | null>(null);
const messageSaving = ref(false);
const topicSaving = ref(false);
const communityError = ref<string | null>(null);
const messagesEnd = ref<HTMLElement | null>(null);

const isModerator = computed(() => session.user?.role === "admin" || session.user?.role === "owner");
const isMuted = computed(() => mutedPermanently.value || Boolean(mutedUntil.value));
const orderedMessages = computed(() => [...messages.value].reverse());
const activeTopics = computed(() => topics.value.filter((topic) => topic.isPublished));
const archivedTopics = computed(() => topics.value.filter((topic) => !topic.isPublished && topic.archivedUntil));
const canWrite = computed(
  () => selectedTopic.value && !selectedTopic.value.isLocked && selectedTopic.value.isPublished && !isMuted.value
);
const quickEmoji = ["👍", "🔥", "❤️", "🙂", "😂", "👏"];
const muteOptions = [
  { label: "30 мин", minutes: 30 },
  { label: "1 час", minutes: 60 },
  { label: "6 часов", minutes: 360 },
  { label: "12 часов", minutes: 720 },
  { label: "24 часа", minutes: 1440 },
  { label: "Бессрочно", minutes: null }
] as const;

function authorName(message: ClubMessage) {
  return message.author.firstName || message.author.username || `ID ${message.author.telegramId}`;
}

function formatMessageTime(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatArchiveUntil(value: string | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "";
}

function appendEmoji(emoji: string) {
  newMessage.value = `${newMessage.value}${emoji}`;
}

function startReply(message: ClubMessage) {
  replyToMessage.value = message;
  newMessage.value = newMessage.value || "";
}

function handlePointerDown(event: PointerEvent) {
  pointerStartX.value = event.clientX;
  pointerStartY.value = event.clientY;
}

function handlePointerUp(event: PointerEvent, message: ClubMessage) {
  if (pointerStartX.value === null || pointerStartY.value === null) {
    return;
  }

  const deltaX = event.clientX - pointerStartX.value;
  const deltaY = Math.abs(event.clientY - pointerStartY.value);
  pointerStartX.value = null;
  pointerStartY.value = null;

  if (deltaX > 54 && deltaY < 40) {
    startReply(message);
  }
}

async function scrollToBottom() {
  await nextTick();
  messagesEnd.value?.scrollIntoView({ block: "end" });
}

async function loadTopics() {
  loading.value = true;
  communityError.value = null;
  try {
    const response = await getCommunityTopics();
    topics.value = response.topics;
    if (selectedTopic.value) {
      selectedTopic.value = response.topics.find((topic) => topic.id === selectedTopic.value?.id) ?? selectedTopic.value;
    }
  } catch {
    communityError.value = "Не удалось загрузить общение.";
  } finally {
    loading.value = false;
  }
}

async function openTopic(topic: ClubTopic) {
  selectedTopic.value = topic;
  communityError.value = null;
  const response = await getClubMessages(topic.id);
  messages.value = response.messages;
  mutedUntil.value = response.mutedUntil;
  mutedPermanently.value = response.mutedPermanently;
  await scrollToBottom();
}

async function createTopic() {
  if (!newTopicTitle.value.trim()) {
    return;
  }

  topicSaving.value = true;
  communityError.value = null;
  try {
    const response = await createCommunityTopic({
      title: newTopicTitle.value,
      description: null
    });
    topics.value = [response.topic, ...topics.value];
    newTopicTitle.value = "";
    showCreateTopic.value = false;
  } catch {
    communityError.value = "Не удалось создать тему.";
  } finally {
    topicSaving.value = false;
  }
}

async function updateSelectedTopic(patch: Partial<Pick<ClubTopic, "isLocked" | "isPublished">>) {
  if (!selectedTopic.value) {
    return;
  }

  const response = await updateClubTopicSettings(selectedTopic.value.id, patch);
  selectedTopic.value = response.topic;
  topics.value = topics.value.map((topic) => (topic.id === response.topic.id ? response.topic : topic));

  if (patch.isPublished === false) {
    selectedTopic.value = null;
    await loadTopics();
  }
}

async function restoreTopic(topic: ClubTopic) {
  const response = await updateClubTopicSettings(topic.id, { isPublished: true });
  topics.value = topics.value.map((item) => (item.id === topic.id ? response.topic : item));
}

async function handleSendMessage() {
  if (!selectedTopic.value || !newMessage.value.trim()) {
    return;
  }

  messageSaving.value = true;
  communityError.value = null;
  try {
    const response = await createClubMessage(selectedTopic.value.id, newMessage.value, replyToMessage.value?.id ?? null);
    newMessage.value = "";
    replyToMessage.value = null;
    messages.value = [response.message, ...messages.value];
    selectedTopic.value = {
      ...selectedTopic.value,
      messagesCount: selectedTopic.value.messagesCount + 1
    };
    topics.value = topics.value.map((topic) => (topic.id === selectedTopic.value?.id ? selectedTopic.value : topic));
    await scrollToBottom();
  } catch {
    communityError.value = "Не удалось отправить сообщение.";
  } finally {
    messageSaving.value = false;
  }
}

async function handleMessageStatus(message: ClubMessage, status: "visible" | "hidden" | "deleted") {
  await updateModerationStatus("chat_message", message.id, status);
  messages.value = messages.value.map((item) => (item.id === message.id ? { ...item, status } : item));
  activeModerationMessageId.value = null;
}

async function handleMute(message: ClubMessage, minutes: number | null) {
  const expiresAt = minutes === null ? null : new Date(Date.now() + minutes * 60 * 1000).toISOString();
  await createUserMute({
    telegramId: message.author.telegramId,
    kind: minutes === null ? "permanent" : "temporary",
    reason: "Модерация сообщения в чате",
    expiresAt
  });
  activeModerationMessageId.value = null;
}

async function handleReaction(message: ClubMessage, reaction: "like" | "dislike") {
  const nextReaction = message.myReaction === reaction ? null : reaction;
  const response = await reactToClubMessage(message.id, nextReaction);
  messages.value = messages.value.map((item) => (item.id === message.id ? response.message : item));
}

onMounted(() => {
  void loadTopics();
});
</script>

<template>
  <section class="community-chat-shell">
    <div v-if="!selectedTopic" class="space-y-3">
      <div class="community-topline">
        <div>
          <h2 class="section-title">{{ t("communityTitle") }}</h2>
          <p class="mt-1 text-xs text-[var(--muted)]">{{ t("communityIntro") }}</p>
        </div>
        <button
          v-if="isModerator"
          class="icon-button"
          type="button"
          aria-label="Добавить тему"
          @click="showCreateTopic = !showCreateTopic"
        >
          <Plus class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <form v-if="isModerator && showCreateTopic" class="chat-create-form" @submit.prevent="createTopic">
        <input v-model.trim="newTopicTitle" class="text-input" placeholder="Название темы" />
        <button class="primary-button" type="submit" :disabled="topicSaving">
          {{ topicSaving ? t("loading") : t("create") }}
        </button>
      </form>

      <div v-if="loading" class="text-xs text-[var(--muted)]">{{ t("loading") }}</div>
      <p v-if="communityError" class="text-xs text-[var(--danger)]">{{ communityError }}</p>

      <div v-if="!activeTopics.length && !archivedTopics.length && !loading" class="surface-card text-sm text-[var(--muted)]">
        {{ t("communityEmpty") }}
      </div>

      <div class="chat-topic-list">
        <button
          v-for="topic in activeTopics"
          :key="topic.id"
          class="chat-topic-card"
          type="button"
          @click="openTopic(topic)"
        >
          <span class="chat-topic-icon">
            <MessageCircle class="h-4 w-4" aria-hidden="true" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="chat-topic-title">{{ topic.title }}</span>
            <span class="chat-topic-meta">
              {{ topic.messagesCount }} сообщений
              <span v-if="topic.isLocked"> · закрыта</span>
            </span>
          </span>
        </button>
      </div>

      <div v-if="isModerator && archivedTopics.length" class="chat-archive-list">
        <p class="section-eyebrow">Архив</p>
        <article v-for="topic in archivedTopics" :key="topic.id" class="chat-topic-card chat-topic-card-archived">
          <span class="chat-topic-icon">
            <Trash2 class="h-4 w-4" aria-hidden="true" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="chat-topic-title">{{ topic.title }}</span>
            <span class="chat-topic-meta">В архиве до {{ formatArchiveUntil(topic.archivedUntil) }}</span>
          </span>
          <button class="mini-action" type="button" @click="restoreTopic(topic)">Вернуть</button>
        </article>
      </div>
    </div>

    <div v-else class="chat-room">
      <header class="chat-room-header">
        <button class="icon-button" type="button" aria-label="Назад" @click="selectedTopic = null">
          <ArrowLeft class="h-4 w-4" aria-hidden="true" />
        </button>
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-sm font-semibold text-[var(--text)]">{{ selectedTopic.title }}</h2>
          <p class="text-xs text-[var(--muted)]">
            {{ selectedTopic.isLocked ? "Тема закрыта" : "Открытый чат" }}
          </p>
        </div>
        <div v-if="isModerator" class="flex gap-1">
          <button class="icon-button" type="button" aria-label="Закрыть тему" @click="updateSelectedTopic({ isLocked: !selectedTopic.isLocked })">
            <Lock class="h-4 w-4" aria-hidden="true" />
          </button>
          <button class="icon-button" type="button" aria-label="В архив" @click="updateSelectedTopic({ isPublished: false })">
            <Trash2 class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <p v-if="communityError" class="px-1 text-xs text-[var(--danger)]">{{ communityError }}</p>
      <p v-if="mutedPermanently" class="px-1 text-xs text-[var(--danger)]">{{ t("mutedPermanent") }}</p>
      <p v-else-if="mutedUntil" class="px-1 text-xs text-[var(--danger)]">{{ t("mutedTemporary") }}</p>

      <div class="chat-messages">
        <p v-if="!messages.length" class="py-6 text-center text-xs text-[var(--muted)]">{{ t("messagesEmpty") }}</p>
        <article
          v-for="message in orderedMessages"
          :key="message.id"
          class="chat-message"
          :class="{ 'opacity-55': message.status !== 'visible' }"
          @pointerdown="handlePointerDown"
          @pointerup="handlePointerUp($event, message)"
        >
          <div class="chat-message-head">
            <button
              v-if="isModerator"
              class="chat-message-author"
              type="button"
              @click.stop="activeModerationMessageId = activeModerationMessageId === message.id ? null : message.id"
            >
              {{ authorName(message) }}
            </button>
            <span v-else class="chat-message-author">{{ authorName(message) }}</span>
            <span>{{ formatMessageTime(message.createdAt) }}</span>
          </div>
          <button v-if="message.replyTo" class="reply-preview" type="button" @click="startReply(message)">
            <span>{{ authorName({ ...message, author: message.replyTo.author }) }}</span>
            <span>{{ message.replyTo.body }}</span>
          </button>
          <p class="chat-message-body">{{ message.body }}</p>
          <p v-if="message.status !== 'visible'" class="mt-1 text-[0.68rem] text-[var(--danger)]">
            {{ message.status === "deleted" ? "Удалено" : "Скрыто" }}
          </p>
          <div class="message-actions">
            <button
              class="message-action"
              :class="{ 'message-action-active': message.myReaction === 'like' }"
              type="button"
              @click="handleReaction(message, 'like')"
            >
              <ThumbsUp class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ message.likesCount || "" }}</span>
            </button>
            <button
              class="message-action"
              :class="{ 'message-action-active': message.myReaction === 'dislike' }"
              type="button"
              @click="handleReaction(message, 'dislike')"
            >
              <ThumbsDown class="h-3.5 w-3.5" aria-hidden="true" />
              <span>{{ message.dislikesCount || "" }}</span>
            </button>
            <button class="message-action" type="button" @click="startReply(message)">
              <Reply class="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div v-if="isModerator && activeModerationMessageId === message.id" class="moderation-menu">
            <button class="mini-action" type="button" @click="handleMessageStatus(message, message.status === 'visible' ? 'deleted' : 'visible')">
              {{ message.status === "visible" ? "Удалить" : "Вернуть" }}
            </button>
            <button
              v-for="option in muteOptions"
              :key="option.label"
              class="mini-action"
              type="button"
              @click="handleMute(message, option.minutes)"
            >
              Мут {{ option.label }}
            </button>
          </div>
        </article>
        <div ref="messagesEnd"></div>
      </div>

      <form class="chat-compose" @submit.prevent="handleSendMessage">
        <div v-if="replyToMessage" class="compose-reply">
          <div class="min-w-0">
            <p>Ответ {{ authorName(replyToMessage) }}</p>
            <span>{{ replyToMessage.body }}</span>
          </div>
          <button type="button" aria-label="Убрать ответ" @click="replyToMessage = null">
            <X class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div class="emoji-row">
          <Smile class="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />
          <button v-for="emoji in quickEmoji" :key="emoji" type="button" @click="appendEmoji(emoji)">
            {{ emoji }}
          </button>
        </div>
        <div class="chat-input-row">
          <input
            v-model.trim="newMessage"
            class="text-input"
            :placeholder="t('messagePlaceholder')"
            :disabled="!canWrite || messageSaving"
          />
          <button class="icon-button" type="submit" aria-label="Отправить" :disabled="!canWrite || messageSaving">
            <Send class="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  </section>
</template>
