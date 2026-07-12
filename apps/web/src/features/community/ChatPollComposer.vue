<script setup lang="ts">
import { ref } from "vue";
import { Plus, Trash2, X } from "lucide-vue-next";
const emit = defineEmits<{ close: []; submit: [payload: { question: string; options: string[]; allowsMultiple: boolean; isAnonymous: boolean; closesAt: string | null }] }>();
const question = ref("");
const options = ref(["", ""]);
const allowsMultiple = ref(false);
const isAnonymous = ref(true);
const closesAt = ref("");
const error = ref("");
function addOption() { if (options.value.length < 10) options.value.push(""); }
function removeOption(index: number) { if (options.value.length > 2) options.value.splice(index, 1); }
function submit() {
  const values = options.value.map((value) => value.trim()).filter(Boolean);
  if (!question.value.trim() || values.length < 2) { error.value = "Введите вопрос и минимум два варианта."; return; }
  emit("submit", { question: question.value.trim(), options: values, allowsMultiple: allowsMultiple.value, isAnonymous: isAnonymous.value, closesAt: closesAt.value ? new Date(closesAt.value).toISOString() : null });
}
</script>
<template>
  <Teleport to="body">
    <div class="chat-poll-sheet-backdrop" @click.self="emit('close')">
      <form class="chat-poll-sheet" @submit.prevent="submit">
        <header><div><small>Сообщение в чат</small><h3>Новый опрос</h3></div><button type="button" aria-label="Закрыть" @click="emit('close')"><X /></button></header>
        <label><span>Вопрос</span><input v-model="question" class="text-input" maxlength="500" /></label>
        <div class="chat-poll-options">
          <label v-for="(_, index) in options" :key="index"><span>Вариант {{ index + 1 }}</span><div><input v-model="options[index]" class="text-input" maxlength="300" /><button type="button" aria-label="Удалить вариант" :disabled="options.length <= 2" @click="removeOption(index)"><Trash2 /></button></div></label>
        </div>
        <button class="chat-poll-add" type="button" :disabled="options.length >= 10" @click="addOption"><Plus /> Добавить вариант</button>
        <label class="chat-poll-toggle"><input v-model="allowsMultiple" type="checkbox" /><span>Можно выбрать несколько</span></label>
        <label class="chat-poll-toggle"><input v-model="isAnonymous" type="checkbox" /><span>Анонимный опрос</span></label>
        <label><span>Завершить автоматически (необязательно)</span><input v-model="closesAt" class="text-input" type="datetime-local" /></label>
        <p v-if="error" class="chat-poll-error">{{ error }}</p>
        <button class="primary-button ui-button" type="submit">Опубликовать опрос</button>
      </form>
    </div>
  </Teleport>
</template>
