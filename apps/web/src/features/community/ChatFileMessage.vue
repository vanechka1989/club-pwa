<script setup lang="ts">
import type { CommunityDocumentAttachment, CommunityVideoAttachment } from "@club/shared";
import { FileText, ShieldAlert, ShieldCheck, ShieldEllipsis, Video } from "lucide-vue-next";
import { computed, ref } from "vue";
import { formatCommunityFileSize } from "@/stores/communityUploads";
import { useReactiveRetention } from "./useReactiveRetention";

const props = defineProps<{
  kind: "video" | "document";
  attachment: CommunityVideoAttachment | CommunityDocumentAttachment;
  refreshUrl?: (() => Promise<string | null>) | undefined;
}>();

const retention = useReactiveRetention(() => [props.attachment.expiresAt]);
const activatedUrl = ref<string | null>(null);
const activating = ref(false);
const activationFailed = ref(false);

const displayName = computed(() => {
  const value = props.attachment.fileName || (props.kind === "video" ? "Видео" : "Документ");
  return /[<>\u0000-\u001f]/u.test(value) ? (props.kind === "video" ? "Видео" : "Файл") : value;
});
const removed = computed(() => Boolean(
  props.attachment.deletedAt
  || props.attachment.scanStatus === "deleted"
  || retention.isExpired(props.attachment.expiresAt)
));
const status = computed(() => (props.attachment.scanStatus as string) === "infected" ? "rejected" : props.attachment.scanStatus);
function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value, window.location.href);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null;
  } catch {
    return null;
  }
}
const ready = computed(() => !removed.value && status.value === "ready" && Boolean(safeHttpUrl(props.attachment.url)));
const stateCopy = computed(() => {
  if (removed.value) return "Файл удалён по сроку хранения";
  if (status.value === "pending" || status.value === "scanning") return "Проверяем файл на вирусы";
  if (status.value === "rejected") return "Файл заблокирован: обнаружена угроза";
  if (status.value === "failed") return "Проверка недоступна. Файл остаётся в карантине";
  if (status.value === "ready" && (!ready.value || activationFailed.value)) return "Ссылка на файл недоступна";
  return null;
});

async function activate() {
  if (!ready.value || activating.value || !props.refreshUrl) return;
  activating.value = true;
  activationFailed.value = false;
  try {
    const refreshed = safeHttpUrl(await props.refreshUrl());
    if (!refreshed) {
      activationFailed.value = true;
      return;
    }
    if (props.kind === "video") {
      activatedUrl.value = refreshed;
    } else {
      window.open(refreshed, "_blank", "noopener,noreferrer");
    }
  } catch {
    activationFailed.value = true;
  } finally {
    activating.value = false;
  }
}
</script>

<template>
  <div class="chat-file-message" :data-status="removed ? 'deleted' : status">
    <video
      v-if="kind === 'video' && activatedUrl && !removed"
      class="chat-file-video"
      :src="activatedUrl"
      controls
      playsinline
      preload="metadata"
    ></video>
    <div v-else class="chat-file-message-row">
      <ShieldAlert v-if="status === 'rejected' || status === 'failed'" aria-hidden="true" />
      <ShieldEllipsis v-else-if="status === 'pending' || status === 'scanning'" aria-hidden="true" />
      <ShieldCheck v-else-if="ready" aria-hidden="true" />
      <Video v-else-if="kind === 'video'" aria-hidden="true" />
      <FileText v-else aria-hidden="true" />
      <div class="chat-file-message-copy">
        <strong>{{ displayName }}</strong>
        <span>{{ formatCommunityFileSize(attachment.sizeBytes) }}</span>
        <span v-if="stateCopy" class="chat-file-state" role="status">{{ stateCopy }}</span>
      </div>
      <button
        v-if="kind === 'document' && ready"
        class="chat-file-download"
        type="button"
        :disabled="activating"
        :aria-label="`Скачать ${displayName}`"
        @click="activate"
      >{{ activating ? "Обновляем…" : "Скачать" }}</button>
      <button
        v-else-if="kind === 'video' && ready"
        class="chat-file-download"
        type="button"
        :disabled="activating"
        :aria-label="`Воспроизвести ${displayName}`"
        @click="activate"
      >{{ activating ? "Обновляем…" : "Воспроизвести" }}</button>
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
