<script setup lang="ts">
import type { ClubTopic } from "@club/shared";
import { Lock, MessageCircle, Trash2 } from "lucide-vue-next";
import { formatArchiveDeletionLabel } from "@/features/app/archiveCountdown";
import { useI18n } from "@/features/app/i18n";

defineProps<{
  activeTopics: ClubTopic[];
  archivedTopics: ClubTopic[];
  isModerator: boolean;
  hasNewReplyToMe: (topic: ClubTopic) => boolean;
}>();

defineEmits<{
  openTopic: [topic: ClubTopic];
  restoreTopic: [topic: ClubTopic];
}>();

const { t } = useI18n();

function unreadLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} непрочитанных сообщений`;
  if (last === 1) return `${count} непрочитанное сообщение`;
  if (last >= 2 && last <= 4) return `${count} непрочитанных сообщения`;
  return `${count} непрочитанных сообщений`;
}
</script>

<template>
  <div class="chat-topic-list">
    <button
      v-for="topic in activeTopics"
      :key="topic.id"
      class="chat-topic-card"
      type="button"
      @click="$emit('openTopic', topic)"
    >
      <span class="chat-topic-icon">
        <MessageCircle class="h-4 w-4" aria-hidden="true" />
      </span>
      <span class="min-w-0 flex-1">
        <span class="chat-topic-title-row">
          <span class="chat-topic-title">{{ topic.title }}</span>
          <span v-if="topic.isAdminOnly" class="admin-only-topic-badge">
            <Lock class="h-3 w-3" aria-hidden="true" />
            {{ t("communityAdminOnlyBadge") }}
          </span>
        </span>
        <span class="chat-topic-meta">
          {{ topic.messagesCount }} сообщений
          <span v-if="topic.isLocked"> · закрыта</span>
        </span>
      </span>
      <span
        v-if="topic.unreadCount > 0"
        class="chat-topic-unread-badge"
        role="status"
        :aria-label="unreadLabel(topic.unreadCount)"
      >{{ topic.unreadCount }}</span>
      <span v-if="hasNewReplyToMe(topic)" class="reply-topic-badge">Вам ответили</span>
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
        <span class="chat-topic-meta">{{ formatArchiveDeletionLabel(topic.archivedUntil) }}</span>
      </span>
      <button class="mini-action" type="button" @click="$emit('restoreTopic', topic)">Вернуть</button>
    </article>
  </div>
</template>
