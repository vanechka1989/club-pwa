<script setup lang="ts">
import type { ClubMessage } from "@club/shared";
import { computed, nextTick, ref, watch } from "vue";
import { Pause, Play, RotateCcw } from "lucide-vue-next";
import { useStableMediaUrl } from "./useStableMediaUrl";
import ChatVoiceWaveform from "./ChatVoiceWaveform.vue";
import { formatVoiceTime } from "./voiceWaveform";
import { useReactiveRetention } from "./useReactiveRetention";

const props = defineProps<{ voice: NonNullable<ClubMessage["voice"]> }>();
const audio = ref<HTMLAudioElement | null>(null);
const playing = ref(false);
const currentTime = ref(0);
const mediaDuration = ref(0);
const playbackFailed = ref(false);
const loading = ref(false);
const retrying = ref(false);
const mediaUrl = useStableMediaUrl(props.voice.url ?? "");
const retention = useReactiveRetention(() => [props.voice.expiresAt]);
const duration = computed(() => mediaDuration.value || props.voice.durationSeconds || 0);
const removed = computed(() => Boolean(
  props.voice.deletedAt
  || props.voice.scanStatus === "deleted"
  || retention.isExpired(props.voice.expiresAt)
));
const ready = computed(() => !removed.value && props.voice.scanStatus === "ready" && Boolean(props.voice.url));
const stateCopy = computed(() => {
  if (removed.value) return "Голосовое удалено по сроку хранения";
  if (props.voice.scanStatus === "pending" || props.voice.scanStatus === "scanning") return "Голосовое обрабатывается";
  if (props.voice.scanStatus === "failed") return "Не удалось обработать голосовое";
  if (props.voice.scanStatus === "rejected") return "Голосовое заблокировано";
  if (props.voice.scanStatus === "ready" && !props.voice.url) return "Голосовое временно недоступно";
  return null;
});
const waveform = [0.38, 0.58, 0.82, 0.48, 0.72, 0.96, 0.54, 0.78, 0.44, 0.68, 0.9, 0.52, 0.74, 0.42, 0.62, 0.86, 0.5, 0.7];

watch(() => props.voice.url, (url) => mediaUrl.observe(url ?? ""));

function handleMetadata() {
  if (audio.value && Number.isFinite(audio.value.duration)) mediaDuration.value = audio.value.duration;
  loading.value = false;
}

async function togglePlayback() {
  if (!audio.value) return;
  if (playbackFailed.value && mediaUrl.refresh()) {
    await nextTick();
    audio.value.load();
  }
  playbackFailed.value = false;
  if (!audio.value.paused) {
    audio.value.pause();
    return;
  }
  loading.value = true;
  try {
    await audio.value.play();
  } catch {
    if (!retrying.value && mediaUrl.refresh()) {
      retrying.value = true;
      await nextTick();
      audio.value.load();
      try {
        await audio.value.play();
        retrying.value = false;
        return;
      } catch {
        retrying.value = false;
      }
    }
    handlePlaybackError();
  }
}

function handlePlaybackError() {
  playbackFailed.value = true;
  loading.value = false;
  playing.value = false;
}

function seek(next: number) {
  if (!audio.value) return;
  audio.value.currentTime = next;
  currentTime.value = next;
}
</script>

<template>
  <div class="chat-voice-message">
    <p v-if="stateCopy" :class="removed ? 'chat-media-expired' : 'chat-media-state'" role="status">{{ stateCopy }}</p>
    <div v-if="ready" class="chat-voice-player" :class="{ 'chat-voice-player-error': playbackFailed }">
      <audio
        ref="audio"
        :src="mediaUrl.currentUrl.value"
        preload="metadata"
        playsinline
        :aria-label="`Голосовое сообщение, ${voice.durationSeconds} секунд`"
        @loadedmetadata="handleMetadata"
        @canplay="loading = false"
        @play="playing = true; loading = false"
        @pause="playing = false"
        @ended="playing = false; currentTime = 0"
        @timeupdate="currentTime = audio?.currentTime ?? 0"
        @error="handlePlaybackError"
      ></audio>
      <button class="chat-voice-play" type="button" :aria-label="playing ? 'Пауза' : 'Воспроизвести'" @click.stop="togglePlayback">
        <Pause v-if="playing" aria-hidden="true" />
        <RotateCcw v-else-if="playbackFailed" aria-hidden="true" />
        <Play v-else aria-hidden="true" />
      </button>
      <div class="chat-voice-track">
        <ChatVoiceWaveform
          :levels="waveform"
          :current-time="currentTime"
          :duration="duration"
          interactive
          @click.stop
          @seek="seek"
        />
        <span>{{ playbackFailed ? "Не удалось воспроизвести" : loading ? "Загрузка…" : `${formatVoiceTime(currentTime)} / ${formatVoiceTime(duration)}` }}</span>
      </div>
    </div>
  </div>
</template>
