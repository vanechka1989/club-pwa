<script setup lang="ts">
import { computed } from "vue";
import { normalizeVoiceLevel, voiceProgress } from "./voiceWaveform";

const props = withDefaults(
  defineProps<{
    levels: number[];
    currentTime: number;
    duration: number;
    interactive?: boolean;
    ariaLabel?: string;
  }>(),
  {
    interactive: false,
    ariaLabel: "Перемотка голосового сообщения"
  }
);

const emit = defineEmits<{
  seek: [value: number];
}>();

const safeLevels = computed(() =>
  props.levels.length > 0 ? props.levels : [0.26, 0.42, 0.64, 0.38, 0.76, 0.52, 0.88, 0.46, 0.7, 0.34, 0.58, 0.8]
);
const progress = computed(() => voiceProgress(props.currentTime, props.duration));

function handleSeek(event: Event) {
  emit("seek", Number((event.target as HTMLInputElement).value));
}
</script>

<template>
  <div class="chat-voice-waveform">
    <span class="chat-voice-wave-bars" aria-hidden="true">
      <i
        v-for="(level, index) in safeLevels"
        :key="index"
        class="chat-voice-wave-bar"
        :class="{ 'chat-voice-wave-bar-played': (index + 1) / safeLevels.length <= progress }"
        :style="{ height: `${Math.round(normalizeVoiceLevel(level) * 100)}%` }"
      ></i>
    </span>
    <input
      v-if="interactive"
      class="chat-voice-wave-seek"
      type="range"
      min="0"
      :max="Math.max(0, duration)"
      step="0.01"
      :value="Math.min(Math.max(0, currentTime), Math.max(0, duration))"
      :aria-label="ariaLabel"
      @input="handleSeek"
    />
  </div>
</template>
