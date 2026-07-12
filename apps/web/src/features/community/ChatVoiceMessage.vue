<script setup lang="ts">
import type { ClubMessage } from "@club/shared";
defineProps<{ voice: NonNullable<ClubMessage["voice"]> }>();
</script>
<template>
  <div class="chat-voice-message">
    <p v-if="voice.deletedAt || !voice.url" class="chat-media-expired">Голосовое удалено по сроку хранения</p>
    <audio v-else :src="voice.url" controls preload="metadata" :aria-label="`Голосовое сообщение, ${voice.durationSeconds} секунд`"></audio>
  </div>
</template>
