<script setup lang="ts">
import type { CommunityDocumentAttachment, CommunityVideoAttachment } from "@club/shared";
import { FileText, ShieldAlert, ShieldCheck, ShieldEllipsis, Video } from "lucide-vue-next";
import { computed } from "vue";
import { formatCommunityFileSize } from "@/stores/communityUploads";

const props = defineProps<{
  kind: "video" | "document";
  attachment: CommunityVideoAttachment | CommunityDocumentAttachment;
}>();

const displayName = computed(() => {
  const value = props.attachment.fileName || (props.kind === "video" ? "Видео" : "Документ");
  return /[<>\u0000-\u001f]/u.test(value) ? (props.kind === "video" ? "Видео" : "Файл") : value;
});
const removed = computed(() => Boolean(
  props.attachment.deletedAt
  || props.attachment.scanStatus === "deleted"
  || (props.attachment.expiresAt && Date.parse(props.attachment.expiresAt) <= Date.now())
));
const status = computed(() => (props.attachment.scanStatus as string) === "infected" ? "rejected" : props.attachment.scanStatus);
const safeUrl = computed(() => {
  if (removed.value || status.value !== "ready" || !props.attachment.url) return null;
  try {
    const parsed = new URL(props.attachment.url, window.location.href);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
});
const stateCopy = computed(() => {
  if (removed.value) return "Файл удалён по сроку хранения";
  if (status.value === "pending" || status.value === "scanning") return "Проверяем файл на вирусы";
  if (status.value === "rejected") return "Файл заблокирован: обнаружена угроза";
  if (status.value === "failed") return "Проверка недоступна. Файл остаётся в карантине";
  if (status.value === "ready" && !safeUrl.value) return "Ссылка на файл недоступна";
  return null;
});
</script>

<template>
  <div class="chat-file-message" :data-status="removed ? 'deleted' : status">
    <video
      v-if="kind === 'video' && safeUrl"
      class="chat-file-video"
      :src="safeUrl"
      controls
      playsinline
      preload="metadata"
    ></video>
    <div v-else class="chat-file-message-row">
      <ShieldAlert v-if="status === 'rejected' || status === 'failed'" aria-hidden="true" />
      <ShieldEllipsis v-else-if="status === 'pending' || status === 'scanning'" aria-hidden="true" />
      <ShieldCheck v-else-if="status === 'ready' && safeUrl" aria-hidden="true" />
      <Video v-else-if="kind === 'video'" aria-hidden="true" />
      <FileText v-else aria-hidden="true" />
      <div class="chat-file-message-copy">
        <strong>{{ displayName }}</strong>
        <span>{{ formatCommunityFileSize(attachment.sizeBytes) }}</span>
        <span v-if="stateCopy" class="chat-file-state" role="status">{{ stateCopy }}</span>
      </div>
      <a
        v-if="kind === 'document' && safeUrl"
        class="chat-file-download"
        :href="safeUrl"
        target="_blank"
        rel="noopener noreferrer"
        :download="displayName"
        :aria-label="`Скачать ${displayName}`"
      >Скачать</a>
      <button
        v-else-if="kind === 'document'"
        class="chat-file-download"
        type="button"
        disabled
        :aria-label="`Скачать ${displayName}`"
      >Скачать</button>
    </div>
  </div>
</template>
