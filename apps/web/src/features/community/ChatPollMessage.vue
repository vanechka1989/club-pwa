<script setup lang="ts">
import type { ClubMessage } from "@club/shared";
import { computed, ref, watch } from "vue";
const props = defineProps<{ poll: NonNullable<ClubMessage["poll"]>; moderator: boolean; disabled?: boolean }>();
const emit = defineEmits<{ vote: [optionIds: string[]]; close: [] }>();
const selected = ref<string[]>([]);
watch(() => props.poll.options, (options) => { selected.value = options.filter((option) => option.selected).map((option) => option.id); }, { immediate: true, deep: true });
const closed = computed(() => Boolean(props.poll.closedAt));
function choose(id: string) {
  if (closed.value || props.disabled) return;
  selected.value = props.poll.allowsMultiple ? (selected.value.includes(id) ? selected.value.filter((value) => value !== id) : [...selected.value, id]) : [id];
  if (!props.poll.allowsMultiple) emit("vote", selected.value);
}
</script>
<template>
  <section class="chat-poll-message" @click.stop>
    <h4>{{ poll.question }}</h4>
    <small>{{ poll.allowsMultiple ? "Можно выбрать несколько" : "Выберите один вариант" }} · {{ poll.isAnonymous ? "Анонимно" : "Открыто" }}</small>
    <button v-for="option in poll.options" :key="option.id" type="button" :class="{ selected: selected.includes(option.id) }" :disabled="closed || disabled" @click="choose(option.id)">
      <span>{{ option.text }}</span><strong>{{ option.percent }}%</strong><i :style="{ width: `${option.percent}%` }"></i>
    </button>
    <button v-if="poll.allowsMultiple && !closed" class="chat-poll-submit" type="button" :disabled="!selected.length || disabled" @click="emit('vote', selected)">Голосовать</button>
    <footer><span>{{ poll.totalVoters }} участников</span><button v-if="moderator && !closed" type="button" @click="emit('close')">Завершить опрос</button><em v-if="closed">Опрос завершён</em></footer>
  </section>
</template>
