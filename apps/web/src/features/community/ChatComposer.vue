<script setup lang="ts">
import { resolveDisplayName, type ClubMessage, type CommunityMention, type CommunityParticipantSuggestionsResponse } from "@club/shared";
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
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "@/features/app/i18n";
import ChatMentionPicker from "./ChatMentionPicker.vue";
import ChatPollComposer from "./ChatPollComposer.vue";
import ChatVoiceWaveform from "./ChatVoiceWaveform.vue";
import { authorName, quickEmoji, type ChatComposerEventMap } from "./communityViewModel";
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
  editMessage?: ClubMessage | null;
}>();

const emit = defineEmits<ChatComposerEventMap>();

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
const textInput = ref<HTMLInputElement | null>(null);
const mentionPicker = ref<{ handleKey: (key: string) => boolean } | null>(null);
const draftValue = ref(props.draft);
const selectedMentions = ref<CommunityMention[]>([]);
const mentionToken = ref<{ start: number; end: number; query: string } | null>(null);

const draftModel = computed({
  get: () => draftValue.value,
  set: (value: string) => updateDraft(value)
});

type Participant = CommunityParticipantSuggestionsResponse["participants"][number];

function rebaseMentions(previous: string, next: string, mentions: CommunityMention[]) {
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < previous.length - prefix
    && suffix < next.length - prefix
    && previous[previous.length - suffix - 1] === next[next.length - suffix - 1]
  ) {
    suffix += 1;
  }
  const oldChangeEnd = previous.length - suffix;
  const delta = next.length - previous.length;
  return mentions.flatMap((mention) => {
    const rebased = mention.end <= prefix
      ? mention
      : mention.start >= oldChangeEnd
        ? { ...mention, start: mention.start + delta, end: mention.end + delta }
        : null;
    return rebased && next.slice(rebased.start, rebased.end) === `@${rebased.displayName}` ? [rebased] : [];
  });
}

function updateDraft(value: string) {
  selectedMentions.value = rebaseMentions(draftValue.value, value, selectedMentions.value);
  draftValue.value = value;
  emit("draft-change", value);
}

function updateMentionToken() {
  const input = textInput.value;
  if (!input) return;
  const caret = input.selectionStart ?? draftValue.value.length;
  const beforeCaret = draftValue.value.slice(0, caret);
  const match = beforeCaret.match(/(?:^|\s)@([^\s@]*)$/u);
  if (!match) {
    mentionToken.value = null;
    return;
  }
  const atOffset = beforeCaret.lastIndexOf("@");
  mentionToken.value = {
    start: atOffset,
    end: caret,
    query: match[1] ?? ""
  };
}

function selectMention(participant: Participant) {
  const token = mentionToken.value;
  if (!token) return;
  const displayName = resolveDisplayName(participant);
  const replacement = `@${displayName}`;
  const value = `${draftValue.value.slice(0, token.start)}${replacement} ${draftValue.value.slice(token.end)}`;
  selectedMentions.value = [
    ...selectedMentions.value.filter((mention) => mention.end <= token.start || mention.start >= token.end),
    {
      userId: participant.id,
      displayName,
      start: token.start,
      end: token.start + replacement.length
    }
  ].sort((left, right) => left.start - right.start);
  draftValue.value = value;
  emit("draft-change", value);
  mentionToken.value = null;
  void nextTick(() => {
    const caret = token.start + replacement.length + 1;
    textInput.value?.focus();
    textInput.value?.setSelectionRange(caret, caret);
  });
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (!mentionToken.value || !mentionPicker.value?.handleKey(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
}

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
  updateDraft(`${draftValue.value}${emoji}`);
  showEmojiPicker.value = false;
}

function handleImageSelection(event: Event) {
  const input = event.target as HTMLInputElement;
  imageDraft.add(Array.from(input.files ?? []));
  input.value = "";
  showAttachmentMenu.value = false;
}

function submitText() {
  const leadingWhitespace = draftValue.value.length - draftValue.value.trimStart().length;
  const body = draftValue.value.trim();
  const mentions = selectedMentions.value.flatMap((mention) => {
    const shifted = { ...mention, start: mention.start - leadingWhitespace, end: mention.end - leadingWhitespace };
    return shifted.start >= 0 && body.slice(shifted.start, shifted.end) === `@${shifted.displayName}` ? [shifted] : [];
  });
  if (!body) return;
  if (props.editMessage) emit("save-edit", props.editMessage, body, mentions);
  else emit("send-text", body, mentions);
}

watch(() => voiceRecorder.previewUrl.value, resetVoicePreviewPlayback);
watch(() => props.draft, (draft) => {
  if (draft !== draftValue.value) {
    draftValue.value = draft;
    if (!draft) selectedMentions.value = [];
  }
});
watch(() => props.editMessage, (message) => {
  selectedMentions.value = message ? [...message.mentions] : [];
  mentionToken.value = null;
});
watch(() => props.resetVersion, () => {
  selectedMentions.value = props.editMessage ? [...props.editMessage.mentions] : [];
  mentionToken.value = null;
  resetLocalDrafts();
});
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
      <div v-if="editMessage" class="compose-reply compose-edit">
        <div class="min-w-0">
          <p>Редактирование сообщения</p>
          <span>Изменения доступны в течение 15 минут после отправки</span>
        </div>
        <button type="button" aria-label="Отменить редактирование" @click="$emit('cancel-edit')">
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
        <div v-else class="chat-text-composer-field">
          <input
            ref="textInput"
            v-model="draftModel"
            class="text-input"
            :placeholder="t('messagePlaceholder')"
            :disabled="!canWrite || messageSaving"
            :aria-expanded="Boolean(mentionToken?.query)"
            aria-autocomplete="list"
            @input="updateMentionToken"
            @click="updateMentionToken"
            @keyup="updateMentionToken"
            @keydown="handleComposerKeydown"
          />
          <ChatMentionPicker
            v-if="mentionToken?.query"
            ref="mentionPicker"
            :query="mentionToken.query"
            @select="selectMention"
            @close="mentionToken = null"
          />
        </div>
        <button
          v-if="draftValue.trim()"
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
