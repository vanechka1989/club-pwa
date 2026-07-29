<script setup lang="ts">
import { FileText, LoaderCircle, RefreshCw, ShieldCheck, Video, X } from "lucide-vue-next";
import { computed } from "vue";
import type { CommunityUploadDraft } from "@/stores/communityUploads";
import { formatCommunityFileSize } from "@/stores/communityUploads";

const props = defineProps<{ draft: CommunityUploadDraft }>();
const emit = defineEmits<{
  cancel: [id: string];
  retry: [id: string];
  remove: [id: string];
  reattach: [id: string, file: File];
}>();

const safeImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const safeVideoTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const displayName = computed(() => /[<>\u0000-\u001f]/u.test(props.draft.fileName) ? "Файл" : props.draft.fileName);
const imagePreview = computed(() =>
  props.draft.kind === "image"
  && safeImageTypes.has(props.draft.contentType)
  && props.draft.previewUrl?.startsWith("blob:")
    ? props.draft.previewUrl
    : null
);
const videoPreview = computed(() =>
  props.draft.kind === "video"
  && safeVideoTypes.has(props.draft.contentType)
  && props.draft.previewUrl?.startsWith("blob:")
    ? props.draft.previewUrl
    : null
);

function handleReattach(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit("reattach", props.draft.id, file);
  input.value = "";
}
</script>

<template>
  <div class="chat-attachment-draft" :data-status="draft.status">
    <div class="chat-attachment-draft-preview">
      <img v-if="imagePreview" :src="imagePreview" :alt="`Предпросмотр ${displayName}`" />
      <video v-else-if="videoPreview" :src="videoPreview" muted playsinline preload="metadata"></video>
      <Video v-else-if="draft.kind === 'video'" aria-hidden="true" />
      <ShieldCheck v-else-if="draft.status === 'uploaded'" aria-hidden="true" />
      <FileText v-else aria-hidden="true" />
    </div>
    <div class="chat-attachment-draft-details">
      <strong>{{ displayName }}</strong>
      <span>{{ formatCommunityFileSize(draft.sizeBytes) }}</span>
      <progress
        v-if="draft.status === 'uploading'"
        :value="draft.progress"
        max="100"
        :aria-label="`Загрузка ${displayName}`"
        :aria-valuenow="draft.progress"
      ></progress>
      <span v-if="draft.status === 'uploaded'" class="chat-upload-ready">Готово к отправке</span>
      <span v-else-if="draft.status === 'needs_file'" class="chat-upload-recovery">Выберите исходный файл, чтобы продолжить</span>
      <span v-if="draft.error" class="chat-upload-error" role="alert">{{ draft.error }}</span>
    </div>
    <button
      v-if="draft.status === 'uploading'"
      class="chat-attachment-primary"
      type="button"
      :aria-label="`Отменить загрузку ${displayName}`"
      @click="emit('cancel', draft.id)"
    >
      <X aria-hidden="true" /><span>Отменить</span>
    </button>
    <button
      v-else-if="draft.status === 'failed' || draft.status === 'cancelled' || draft.status === 'queued'"
      class="chat-attachment-primary"
      type="button"
      :aria-label="`${draft.status === 'queued' ? 'Загрузить' : 'Повторить загрузку'} ${displayName}`"
      @click="emit('retry', draft.id)"
    >
      <RefreshCw aria-hidden="true" /><span>{{ draft.status === "queued" ? "Загрузить" : "Повторить" }}</span>
    </button>
    <label v-else-if="draft.status === 'needs_file'" class="chat-attachment-primary">
      <LoaderCircle aria-hidden="true" /><span>Выбрать файл</span>
      <input class="sr-only" type="file" :accept="draft.contentType" :aria-label="`Выбрать ${displayName} для продолжения`" @change="handleReattach" />
    </label>
    <button
      class="chat-attachment-remove"
      type="button"
      :aria-label="`Удалить вложение ${displayName}`"
      @click="emit('remove', draft.id)"
    >
      <X aria-hidden="true" />
    </button>
  </div>
</template>
