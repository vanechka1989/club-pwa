<script setup lang="ts">
import { resolveDisplayName, type CommunityParticipantSuggestionsResponse } from "@club/shared";
import { ref, watch } from "vue";
import { getCommunityParticipants } from "@/api/client";

type Participant = CommunityParticipantSuggestionsResponse["participants"][number];

const props = defineProps<{
  query: string;
}>();

const emit = defineEmits<{
  select: [participant: Participant];
  close: [];
}>();

const participants = ref<Participant[]>([]);
const activeIndex = ref(0);
let requestVersion = 0;

watch(
  () => props.query,
  async (query) => {
    const version = ++requestVersion;
    activeIndex.value = 0;
    if (!query.trim()) {
      participants.value = [];
      return;
    }
    try {
      const response = await getCommunityParticipants(query.trim(), 10);
      if (version === requestVersion) participants.value = response.participants;
    } catch {
      if (version === requestVersion) participants.value = [];
    }
  },
  { immediate: true }
);

function choose(participant: Participant) {
  emit("select", participant);
}

function handleKey(key: string) {
  if (key === "Escape") {
    emit("close");
    return true;
  }
  if (!participants.value.length) return false;
  if (key === "ArrowDown") {
    activeIndex.value = (activeIndex.value + 1) % participants.value.length;
    return true;
  }
  if (key === "ArrowUp") {
    activeIndex.value = (activeIndex.value - 1 + participants.value.length) % participants.value.length;
    return true;
  }
  if (key === "Enter" || key === "Tab") {
    choose(participants.value[activeIndex.value]!);
    return true;
  }
  return false;
}

defineExpose({ handleKey });
</script>

<template>
  <div
    v-if="participants.length"
    class="chat-mention-picker"
    role="listbox"
    aria-label="Участники чата"
  >
    <button
      v-for="(participant, index) in participants"
      :id="`chat-mention-option-${participant.id}`"
      :key="participant.id"
      class="chat-mention-option"
      :class="{ 'chat-mention-option-active': index === activeIndex }"
      type="button"
      role="option"
      :aria-selected="index === activeIndex"
      @pointerdown.prevent
      @click="choose(participant)"
    >
      <span class="chat-mention-avatar" aria-hidden="true">
        <img v-if="participant.photoUrl" :src="participant.photoUrl" alt="" />
        <span v-else>{{ resolveDisplayName(participant).slice(0, 1).toUpperCase() }}</span>
      </span>
      <span>
        <strong>{{ resolveDisplayName(participant) }}</strong>
        <small v-if="participant.username">@{{ participant.username }}</small>
      </span>
    </button>
  </div>
</template>
