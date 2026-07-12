<script setup lang="ts">
import type { ClubMessage } from "@club/shared";
import { computed, ref } from "vue";
import { Pause, Play, RotateCcw } from "lucide-vue-next";

const props = defineProps<{ voice: NonNullable<ClubMessage["voice"]> }>();
const audio = ref<HTMLAudioElement | null>(null);
const playing = ref(false);
const currentTime = ref(0);
const mediaDuration = ref(0);
const playbackFailed = ref(false);
const loading = ref(false);
const duration = computed(() => mediaDuration.value || props.voice.durationSeconds || 0);
const waveform = [38, 58, 82, 48, 72, 96, 54, 78, 44, 68, 90, 52, 74, 42, 62, 86, 50, 70];

function formatTime(value: number) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function handleMetadata() {
  if (audio.value && Number.isFinite(audio.value.duration)) mediaDuration.value = audio.value.duration;
  loading.value = false;
}

async function togglePlayback() {
  if (!audio.value) return;
  playbackFailed.value = false;
  if (!audio.value.paused) {
    audio.value.pause();
    return;
  }
  loading.value = true;
  try {
    await audio.value.play();
  } catch {
    playbackFailed.value = true;
    loading.value = false;
  }
}

function seek(event: Event) {
  if (!audio.value) return;
  const next = Number((event.target as HTMLInputElement).value);
  audio.value.currentTime = next;
  currentTime.value = next;
}
</script>

<template>
  <div class="chat-voice-message">
    <p v-if="voice.deletedAt || !voice.url" class="chat-media-expired">Голосовое удалено по сроку хранения</p>
    <div v-else class="chat-voice-player" :class="{ 'chat-voice-player-error': playbackFailed }">
      <audio
        ref="audio"
        :src="voice.url"
        preload="metadata"
        :aria-label="`Голосовое сообщение, ${voice.durationSeconds} секунд`"
        @loadedmetadata="handleMetadata"
        @canplay="loading = false"
        @play="playing = true; loading = false"
        @pause="playing = false"
        @ended="playing = false; currentTime = 0"
        @timeupdate="currentTime = audio?.currentTime ?? 0"
        @error="playbackFailed = true"
      ></audio>
      <button class="chat-voice-play" type="button" :aria-label="playing ? 'Пауза' : 'Воспроизвести'" @click.stop="togglePlayback">
        <Pause v-if="playing" aria-hidden="true" />
        <RotateCcw v-else-if="playbackFailed" aria-hidden="true" />
        <Play v-else aria-hidden="true" />
      </button>
      <div class="chat-voice-track">
        <div class="chat-voice-wave" aria-hidden="true">
          <i v-for="(height, index) in waveform" :key="index" :style="{ height: `${height}%` }"></i>
        </div>
        <input
          type="range"
          min="0"
          :max="Math.max(1, duration)"
          step="0.1"
          :value="currentTime"
          aria-label="Перемотка голосового сообщения"
          @click.stop
          @input="seek"
        />
        <span>{{ playbackFailed ? "Не удалось воспроизвести" : loading ? "Загрузка…" : `${formatTime(currentTime)} / ${formatTime(duration)}` }}</span>
      </div>
    </div>
  </div>
</template>
