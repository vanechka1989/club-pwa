<script setup lang="ts">
import type { ClubChat, ClubMessage, ClubTopic } from "@club/shared";
import { Loader2, MessageCircle, Plus } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import {
  createClubChat,
  createClubMessage,
  createClubTopic,
  getClubChats,
  getClubMessages,
  getClubTopics
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
const newChatTitle = ref("");
const newChatDescription = ref("");
const newTopicTitle = ref("");
const newTopicDescription = ref("");
const newMessage = ref("");
const messageSaving = ref(false);
const communityError = ref<string | null>(null);

const isModerator = computed(() => session.user?.role === "admin" || session.user?.role === "owner");
const isMuted = computed(() => mutedPermanently.value || Boolean(mutedUntil.value));

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

async function handleCreateChat() {
  if (!newChatTitle.value.trim()) {
    return;
  }

  communityError.value = null;
  const response = await createClubChat({
    title: newChatTitle.value,
    description: newChatDescription.value || null
  });
  newChatTitle.value = "";
  newChatDescription.value = "";
  chats.value = [response.chat, ...chats.value];
  await openChat(response.chat);
}

async function handleCreateTopic() {
  if (!selectedChat.value || !newTopicTitle.value.trim()) {
    return;
  }

  communityError.value = null;
  const response = await createClubTopic(selectedChat.value.id, {
    title: newTopicTitle.value,
    description: newTopicDescription.value || null
  });
  newTopicTitle.value = "";
  newTopicDescription.value = "";
  topics.value = [response.topic, ...topics.value];
  await openTopic(response.topic);
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

    <section v-if="isModerator" class="surface-card space-y-3">
      <h3 class="font-semibold text-[var(--text)]">{{ t("newChatTitle") }}</h3>
      <input v-model.trim="newChatTitle" class="text-input" :placeholder="t('chatTitlePlaceholder')" />
      <input v-model.trim="newChatDescription" class="text-input" :placeholder="t('descriptionPlaceholder')" />
      <button class="primary-button" type="button" @click="handleCreateChat">
        <Plus class="mr-2 inline h-4 w-4" aria-hidden="true" />
        {{ t("create") }}
      </button>
    </section>
    <p v-else class="text-sm text-[var(--muted)]">{{ t("moderatorOnlyChats") }}</p>
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
              <h3 class="font-semibold text-[var(--text)]">{{ chat.title }}</h3>
              <p v-if="chat.description" class="mt-1 text-sm text-[var(--muted)]">{{ chat.description }}</p>
            </div>
            <span class="role-badge">{{ chat.topicsCount }}</span>
          </div>
        </button>
      </section>

      <section class="space-y-3">
        <div v-if="selectedChat" class="surface-card space-y-3">
          <h3 class="font-semibold text-[var(--text)]">{{ t("newTopicTitle") }}</h3>
          <input v-model.trim="newTopicTitle" class="text-input" :placeholder="t('topicTitlePlaceholder')" />
          <input v-model.trim="newTopicDescription" class="text-input" :placeholder="t('descriptionPlaceholder')" />
          <button class="secondary-button w-full" type="button" :disabled="isMuted" @click="handleCreateTopic">
            {{ t("create") }}
          </button>
        </div>

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
              <h3 class="font-semibold text-[var(--text)]">{{ topic.title }}</h3>
              <p v-if="topic.description" class="mt-1 text-sm text-[var(--muted)]">{{ topic.description }}</p>
              <div class="mt-2 flex gap-2">
                <span v-if="topic.isPinned" class="role-badge">{{ t("pinned") }}</span>
                <span v-if="topic.isLocked" class="role-badge">{{ t("locked") }}</span>
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
          <p v-if="mutedPermanently" class="text-sm text-[var(--danger)]">{{ t("mutedPermanent") }}</p>
          <p v-else-if="mutedUntil" class="text-sm text-[var(--danger)]">{{ t("mutedTemporary") }}</p>
          <form class="grid gap-2" @submit.prevent="handleSendMessage">
            <textarea
              v-model.trim="newMessage"
              class="text-input min-h-24 resize-none"
              :placeholder="t('messagePlaceholder')"
              :disabled="isMuted || selectedTopic.isLocked || messageSaving"
            />
            <button class="primary-button" type="submit" :disabled="isMuted || selectedTopic.isLocked || messageSaving">
              {{ messageSaving ? t("loading") : t("commentSend") }}
            </button>
          </form>

          <p v-if="!messages.length" class="text-sm text-[var(--muted)]">{{ t("messagesEmpty") }}</p>
          <article v-for="message in messages" :key="message.id" class="rounded-xl border border-[var(--border)] p-3">
            <p class="text-sm font-semibold text-[var(--text)]">{{ authorName(message) }}</p>
            <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--muted-strong)]">{{ message.body }}</p>
          </article>
        </section>
      </section>
    </div>
  </section>
</template>
