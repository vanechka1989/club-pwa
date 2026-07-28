<script setup lang="ts">
import type { ClubMessage } from "@club/shared";
import {
  BarChart3,
  Camera,
  Image as ImageIcon,
  LoaderCircle,
  Mic,
  Paperclip,
  Pause,
  Play,
  Send,
  Smile,
  Square,
  Trash2,
  X
} from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "@/features/app/i18n";
import ChatPollComposer from "./ChatPollComposer.vue";
import ChatVoiceWaveform from "./ChatVoiceWaveform.vue";
import { authorName, quickEmoji, type ChatPollDraft } from "./communityViewModel";
import { useImageDraft } from "./useImageDraft";
import { useVoiceRecorder } from "./useVoiceRecorder";
import { formatVoiceTime } from "./voiceWaveform";

const props = defineProps<{
  canWrite: boolean;
  isMuted: boolean;
  muteComposerText: string;
  unavailableComposerText: string;
  messageSaving: boolean;
  replyToMessage: ClubMessage | null;
  draft: string;
  resetVersion: number;
}>();

const emit = defineEmits<{
  "send-text": [body: string];
  "send-voice": [blob: Blob, durationSeconds: number];
  "send-files": [files: File[]];
  "create-poll": [payload: ChatPollDraft];
  "draft-change": [body: string];
  "cancel-reply": [];
}>();

const { t } = useI18n();
const showEmojiPicker = ref(false);
const showAttachmentMenu = ref(false);
const showPollComposer = ref(false);
const imageInput = ref<HTMLInputElement | null>(null);
const cameraInput = ref<HTMLInputElement | null>(null);
const voiceRecorder = useVoiceRecorder();
const imageDraft = useImageDraft();
const voicePreviewAudio = ref<HTMLAudioElement | null>(null);
const voicePreviewPlaying = ref(false);
const voicePreviewCurrentTime = ref(0);
const voicePreviewDuration = ref(0);

const draftModel = computed({
  get: () => props.draft,
  set: (value: string) => emit("draft-change", value)
});

function resetVoicePreviewPlayback() {
  voicePreviewAudio.value?.pause();
  voicePreviewPlaying.value = false;
  voicePreviewCurrentTime.value = 0;
  voicePreviewDuration.value = 0;
}

async function toggleVoicePreviewPlayback() {
  const audio = voicePreviewAudio.value;
  if (!audio) return;
  if (!audio.paused) {
    audio.pause();
    return;
  }
  await audio.play().catch(() => undefined);
}

function seekVoicePreview(value: number) {
  if (!voicePreviewAudio.value) return;
  voicePreviewAudio.value.currentTime = value;
  voicePreviewCurrentTime.value = value;
}

function cancelVoiceDraft() {
  resetVoicePreviewPlayback();
  voiceRecorder.cancel();
}

function resetLocalDrafts() {
  cancelVoiceDraft();
  imageDraft.clear();
  showAttachmentMenu.value = false;
  showEmojiPicker.value = false;
  showPollComposer.value = false;
}

function appendEmoji(emoji: string) {
  emit("draft-change", `${props.draft}${emoji}`);
  showEmojiPicker.value = false;
}

function handleImageSelection(event: Event) {
  const input = event.target as HTMLInputElement;
  imageDraft.add(Array.from(input.files ?? []));
  input.value = "";
  showAttachmentMenu.value = false;
}

function submitText() {
  const body = props.draft.trim();
  if (body) emit("send-text", body);
}

watch(() => voiceRecorder.previewUrl.value, resetVoicePreviewPlayback);
watch(() => props.resetVersion, resetLocalDrafts);
onBeforeUnmount(resetLocalDrafts);
</script>

<template>
  <form class="chat-compose" @submit.prevent="submitText">
    <template v-if="canWrite">
      <div v-if="replyToMessage" class="compose-reply">
        <div class="min-w-0">
          <p>Ответ {{ authorName(replyToMessage) }}</p>
          <span>{{ replyToMessage.body }}</span>
        </div>
        <button type="button" aria-label="Убрать ответ" @click="$emit('cancel-reply')">
          <X class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div v-if="voiceRecorder.status.value === 'recording'" class="chat-voice-draft">
        <button class="chat-voice-draft-action chat-voice-draft-delete" type="button" aria-label="Отменить запись" @click="cancelVoiceDraft">
          <Trash2 />
        </button>
        <span class="chat-voice-recording-time">
          <i class="chat-recording-dot"></i>{{ formatVoiceTime(voiceRecorder.durationSeconds.value) }}
        </span>
        <ChatVoiceWaveform
          class="chat-voice-draft-wave"
          :levels="voiceRecorder.levels.value"
          :current-time="0"
          :duration="0"
        />
        <button class="chat-voice-draft-action chat-voice-draft-stop" type="button" aria-label="Остановить запись" @click="voiceRecorder.stop">
          <Square />
        </button>
      </div>
      <div v-else-if="voiceRecorder.previewUrl.value" class="chat-voice-draft">
        <audio
          ref="voicePreviewAudio"
          class="chat-voice-native-audio"
          :src="voiceRecorder.previewUrl.value"
          preload="metadata"
          @loadedmetadata="voicePreviewDuration = voicePreviewAudio?.duration || voiceRecorder.durationSeconds.value"
          @play="voicePreviewPlaying = true"
          @pause="voicePreviewPlaying = false"
          @timeupdate="voicePreviewCurrentTime = voicePreviewAudio?.currentTime ?? 0"
          @ended="voicePreviewPlaying = false; voicePreviewCurrentTime = 0"
        ></audio>
        <button
          class="chat-voice-draft-action chat-voice-draft-play"
          type="button"
          :aria-label="voicePreviewPlaying ? 'Пауза' : 'Воспроизвести запись'"
          @click="toggleVoicePreviewPlayback"
        >
          <Pause v-if="voicePreviewPlaying" />
          <Play v-else />
        </button>
        <div class="chat-voice-draft-preview-track">
          <ChatVoiceWaveform
            :levels="voiceRecorder.levels.value"
            :current-time="voicePreviewCurrentTime"
            :duration="voicePreviewDuration || voiceRecorder.durationSeconds.value"
            interactive
            aria-label="Перемотка записанного голосового сообщения"
            @seek="seekVoicePreview"
          />
          <span>
            {{ formatVoiceTime(voicePreviewCurrentTime) }} /
            {{ formatVoiceTime(voicePreviewDuration || voiceRecorder.durationSeconds.value) }}
          </span>
        </div>
        <button class="chat-voice-draft-action chat-voice-draft-delete" type="button" aria-label="Удалить запись" @click="cancelVoiceDraft">
          <Trash2 />
        </button>
        <button
          class="chat-voice-draft-action chat-draft-send"
          :class="{ 'chat-draft-send-loading': messageSaving }"
          type="button"
          :disabled="messageSaving"
          :aria-busy="messageSaving"
          aria-label="Отправить голосовое сообщение"
          @click="$emit('send-voice', voiceRecorder.blob.value!, voiceRecorder.durationSeconds.value)"
        >
          <LoaderCircle v-if="messageSaving" aria-hidden="true" />
          <Send v-else aria-hidden="true" />
        </button>
      </div>
      <div v-if="imageDraft.hasImages.value" class="chat-image-draft">
        <div>
          <button
            v-for="(url, index) in imageDraft.previews.value"
            :key="url"
            type="button"
            :aria-label="`Удалить изображение ${index + 1}`"
            @click="imageDraft.remove(index)"
          >
            <img :src="url" alt="" /><X />
          </button>
        </div>
        <button type="button" @click="imageDraft.clear">Отмена</button>
        <button
          class="chat-draft-send"
          :class="{ 'chat-draft-send-loading': messageSaving }"
          type="button"
          :disabled="messageSaving"
          :aria-busy="messageSaving"
          @click="$emit('send-files', [...imageDraft.files.value])"
        >
          <LoaderCircle v-if="messageSaving" aria-hidden="true" />
          <span>{{ messageSaving ? "Отправка…" : `Отправить ${imageDraft.files.value.length}` }}</span>
        </button>
      </div>
      <p v-if="voiceRecorder.error.value || imageDraft.error.value" class="chat-media-draft-error">
        {{ voiceRecorder.error.value || imageDraft.error.value }}
      </p>
      <div class="chat-input-row chat-composer-shell">
        <div class="composer-attachment-wrap">
          <button
            class="icon-button ui-icon-button"
            type="button"
            aria-label="Вложения"
            :disabled="!canWrite"
            @click="showAttachmentMenu = !showAttachmentMenu"
          >
            <Paperclip />
          </button>
          <div v-if="showAttachmentMenu" class="composer-attachment-menu">
            <button type="button" @click="imageInput?.click()"><ImageIcon /> Из галереи</button>
            <button type="button" @click="cameraInput?.click()"><Camera /> Сделать фото</button>
            <button type="button" @click="showPollComposer = true; showAttachmentMenu = false"><BarChart3 /> Опрос</button>
          </div>
          <input ref="imageInput" class="sr-only" type="file" accept="image/*" multiple @change="handleImageSelection" />
          <input ref="cameraInput" class="sr-only" type="file" accept="image/*" capture="environment" @change="handleImageSelection" />
        </div>
        <div class="composer-emoji-wrap">
          <button class="icon-button ui-icon-button" type="button" aria-label="Эмодзи" @click="showEmojiPicker = !showEmojiPicker">
            <Smile class="h-4 w-4" aria-hidden="true" />
          </button>
          <div v-if="showEmojiPicker" class="composer-emoji-popover">
            <button v-for="emoji in quickEmoji" :key="emoji" type="button" @click="appendEmoji(emoji)">
              {{ emoji }}
            </button>
          </div>
        </div>
        <div v-if="isMuted" class="mute-compose-notice">{{ muteComposerText }}</div>
        <input
          v-else
          v-model.trim="draftModel"
          class="text-input"
          :placeholder="t('messagePlaceholder')"
          :disabled="!canWrite || messageSaving"
        />
        <button
          v-if="draft.trim()"
          class="icon-button ui-icon-button chat-composer-primary-action"
          type="submit"
          aria-label="Отправить"
          :disabled="!canWrite || messageSaving || isMuted"
        >
          <Send class="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          v-else-if="voiceRecorder.supported.value"
          class="icon-button ui-icon-button"
          type="button"
          aria-label="Записать голосовое"
          :disabled="!canWrite || messageSaving"
          @click="voiceRecorder.start"
        >
          <Mic />
        </button>
        <button v-else class="icon-button ui-icon-button" type="submit" aria-label="Отправить" disabled>
          <Send class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </template>
    <div v-else class="chat-compose-unavailable" role="status">{{ unavailableComposerText }}</div>
  </form>
  <ChatPollComposer v-if="showPollComposer" @close="showPollComposer = false" @submit="$emit('create-poll', $event)" />
</template>
