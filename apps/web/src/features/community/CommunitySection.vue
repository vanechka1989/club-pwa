<script setup lang="ts">
import type { ClubChat, ClubMessage, ClubTopic } from "@club/shared";
import { Loader2, MessageCircle } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import {
  createClubMessage,
  createUserMute,
  getClubChats,
  getClubMessages,
  getClubTopics,
  updateClubTopicSettings,
  updateModerationStatus
} from "@/api/client";
import { useI18n } from "@/features/app/i18n";
import { useSessionStore } from "@/stores/session";

const { t } = useI18n();
const session = useSessionStore();

const chats = ref<ClubChat[]>([]);
const topics = ref<ClubTopic[]>([]);
const messages = ref<ClubMessage[]>([]);
const selectedChat = ref<ClubChat | null>(null);
const selectedTopic = ref<ClubTopic | null>(null);
const loading = ref(false);
const mutedUntil = ref<string | null>(null);
const mutedPermanently = ref(false);
const newMessage = ref("");
const messageSaving = ref(false);
const communityError = ref<string | null>(null);

const isModerator = computed(() => session.user?.role === "admin" || session.user?.role === "owner");
const isMuted = computed(() => mutedPermanently.value || Boolean(mutedUntil.value));
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

async function loadChats() {
  loading.value = true;
  communityError.value = null;
  try {
    const response = await getClubChats();
    chats.value = response.chats;
    if (!selectedChat.value && response.chats[0]) {
      await openChat(response.chats[0]);
    }
  } finally {
    loading.value = false;
  }
}

async function openChat(chat: ClubChat) {
  selectedChat.value = chat;
  selectedTopic.value = null;
  messages.value = [];
  const response = await getClubTopics(chat.id);
  topics.value = response.topics;
  if (response.topics[0]) {
    await openTopic(response.topics[0]);
  }
}

async function openTopic(topic: ClubTopic) {
  selectedTopic.value = topic;
  const response = await getClubMessages(topic.id);
  messages.value = response.messages;
  mutedUntil.value = response.mutedUntil;
  mutedPermanently.value = response.mutedPermanently;
}

async function updateSelectedTopic(patch: Partial<Pick<ClubTopic, "isLocked" | "isPublished">>) {
  if (!selectedTopic.value) {
    return;
  }

  const response = await updateClubTopicSettings(selectedTopic.value.id, patch);
  selectedTopic.value = response.topic;
  topics.value = topics.value.map((topic) => (topic.id === response.topic.id ? response.topic : topic));
}

async function handleSendMessage() {
  if (!selectedTopic.value || !newMessage.value.trim()) {
    return;
  }

  messageSaving.value = true;
  communityError.value = null;
  try {
    const response = await createClubMessage(selectedTopic.value.id, newMessage.value);
    newMessage.value = "";
    messages.value = [response.message, ...messages.value];
    selectedTopic.value = {
      ...selectedTopic.value,
      messagesCount: selectedTopic.value.messagesCount + 1
    };
    topics.value = topics.value.map((topic) => (topic.id === selectedTopic.value?.id ? selectedTopic.value : topic));
  } catch {
    communityError.value = "Не удалось отправить сообщение.";
  } finally {
    messageSaving.value = false;
  }
}

async function handleMessageStatus(message: ClubMessage, status: "visible" | "hidden" | "deleted") {
  await updateModerationStatus("chat_message", message.id, status);
  messages.value = messages.value.map((item) => (item.id === message.id ? { ...item, status } : item));
}

async function handleMute(message: ClubMessage, minutes: number | null) {
  const expiresAt = minutes === null ? null : new Date(Date.now() + minutes * 60 * 1000).toISOString();
  await createUserMute({
    telegramId: message.author.telegramId,
    kind: minutes === null ? "permanent" : "temporary",
    reason: "Модерация сообщения в чате",
    expiresAt
  });
}

onMounted(() => {
  void loadChats();
});
</script>

<template>
  <section class="space-y-5">
    <div>
      <p class="section-eyebrow">{{ t("communityEyebrow") }}</p>
      <h2 class="section-title">{{ t("communityTitle") }}</h2>
      <p class="mt-2 text-sm leading-6 text-[var(--muted)]">{{ t("communityIntro") }}</p>
    </div>

    <div v-if="loading" class="flex items-center gap-2 text-sm text-[var(--muted)]">
      <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
      {{ t("loading") }}
    </div>

    <p v-if="communityError" class="text-sm text-[var(--danger)]">{{ communityError }}</p>

    <div v-if="!chats.length && !loading" class="surface-card text-sm text-[var(--muted)]">
      {{ t("communityEmpty") }}
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-[0.9fr_1.2fr]">
      <section class="space-y-3">
        <button
          v-for="chat in chats"
          :key="chat.id"
          class="surface-card w-full text-left"
          type="button"
          @click="openChat(chat)"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="section-eyebrow">{{ t("category") }}</p>
              <h3 class="mt-1 font-semibold text-[var(--text)]">{{ chat.title }}</h3>
              <p v-if="chat.description" class="mt-1 text-sm text-[var(--muted)]">{{ chat.description }}</p>
            </div>
            <span class="role-badge">{{ chat.topicsCount }}</span>
          </div>
        </button>
      </section>

      <section class="space-y-3">
        <div v-if="!topics.length && selectedChat" class="surface-card text-sm text-[var(--muted)]">
          {{ t("topicEmpty") }}
        </div>

        <button
          v-for="topic in topics"
          :key="topic.id"
          class="surface-card w-full text-left"
          type="button"
          @click="openTopic(topic)"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="section-eyebrow">{{ t("chat") }}</p>
              <h3 class="mt-1 font-semibold text-[var(--text)]">{{ topic.title }}</h3>
              <p v-if="topic.description" class="mt-1 text-sm text-[var(--muted)]">{{ topic.description }}</p>
              <div class="mt-2 flex gap-2">
                <span v-if="topic.isPinned" class="role-badge">{{ t("pinned") }}</span>
                <span v-if="topic.isLocked" class="role-badge">{{ t("locked") }}</span>
                <span v-if="!topic.isPublished" class="role-badge">Удалён</span>
              </div>
            </div>
            <span class="role-badge">{{ topic.messagesCount }}</span>
          </div>
        </button>

        <section v-if="selectedTopic" class="surface-card space-y-3">
          <div class="flex items-center gap-2">
            <MessageCircle class="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <h3 class="font-semibold text-[var(--text)]">{{ selectedTopic.title }}</h3>
          </div>
          <div v-if="isModerator" class="grid grid-cols-2 gap-2">
            <button class="secondary-button px-2 py-2 text-sm" type="button" @click="updateSelectedTopic({ isLocked: !selectedTopic.isLocked })">
              {{ selectedTopic.isLocked ? "Открыть чат" : "Закрыть чат" }}
            </button>
            <button class="secondary-button px-2 py-2 text-sm" type="button" @click="updateSelectedTopic({ isPublished: !selectedTopic.isPublished })">
              {{ selectedTopic.isPublished ? "Удалить чат" : "Вернуть чат" }}
            </button>
          </div>
          <p v-if="mutedPermanently" class="text-sm text-[var(--danger)]">{{ t("mutedPermanent") }}</p>
          <p v-else-if="mutedUntil" class="text-sm text-[var(--danger)]">{{ t("mutedTemporary") }}</p>
          <form class="grid gap-2" @submit.prevent="handleSendMessage">
            <textarea
              v-model.trim="newMessage"
              class="text-input min-h-24 resize-none"
              :placeholder="t('messagePlaceholder')"
              :disabled="isMuted || selectedTopic.isLocked || !selectedTopic.isPublished || messageSaving"
            />
            <button class="primary-button" type="submit" :disabled="isMuted || selectedTopic.isLocked || !selectedTopic.isPublished || messageSaving">
              {{ messageSaving ? t("loading") : t("commentSend") }}
            </button>
          </form>

          <p v-if="!messages.length" class="text-sm text-[var(--muted)]">{{ t("messagesEmpty") }}</p>
          <article
            v-for="message in messages"
            :key="message.id"
            class="message-card"
            :class="{ 'opacity-55': message.status !== 'visible' }"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-[var(--text)]">{{ authorName(message) }}</p>
                <p v-if="message.status !== 'visible'" class="mt-1 text-xs text-[var(--danger)]">
                  {{ message.status === "deleted" ? "Удалено" : "Скрыто" }}
                </p>
              </div>
              <div v-if="isModerator" class="flex gap-1">
                <button
                  class="mini-action"
                  type="button"
                  @click="handleMessageStatus(message, message.status === 'visible' ? 'deleted' : 'visible')"
                >
                  {{ message.status === "visible" ? "Удалить" : "Вернуть" }}
                </button>
              </div>
            </div>
            <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--muted-strong)]">{{ message.body }}</p>
            <div v-if="isModerator" class="mt-3 flex flex-wrap gap-1.5">
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
        </section>
      </section>
    </div>
  </section>
</template>
