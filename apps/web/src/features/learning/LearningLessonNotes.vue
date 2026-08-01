<script setup lang="ts">
import { ref } from "vue";
import type { LessonComment } from "@club/shared";
import { ChevronDown, NotebookPen } from "lucide-vue-next";
import { createLessonComment, getLessonComments } from "@/api/client";

const props = defineProps<{ lessonId: string }>();
const expanded = ref(false);
const loaded = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const saveError = ref("");
const draft = ref("");
const notes = ref<LessonComment[]>([]);

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

async function loadNotes() {
  loading.value = true;
  error.value = "";
  try {
    const response = await getLessonComments(props.lessonId);
    notes.value = response.comments;
    loaded.value = true;
  } catch {
    error.value = "Не удалось загрузить заметки.";
  } finally {
    loading.value = false;
  }
}

function toggle() {
  expanded.value = !expanded.value;
  if (expanded.value && !loaded.value && !loading.value) void loadNotes();
}

async function saveNote() {
  const body = draft.value.trim();
  if (!body || saving.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    const response = await createLessonComment(props.lessonId, body);
    notes.value = [response.comment, ...notes.value.filter((note) => note.id !== response.comment.id)];
    draft.value = "";
  } catch {
    saveError.value = "Не удалось сохранить заметку.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="lesson-notes ui-card">
    <button
      class="lesson-notes-toggle"
      type="button"
      :aria-expanded="expanded"
      :aria-label="expanded ? 'Закрыть мои заметки' : 'Открыть мои заметки'"
      @click="toggle"
    >
      <span><NotebookPen aria-hidden="true" /><strong>Мои заметки</strong></span>
      <ChevronDown aria-hidden="true" :class="{ 'is-expanded': expanded }" />
    </button>

    <div v-if="expanded" class="lesson-notes-body">
      <p v-if="loading" class="lesson-notes-state">Загружаем заметки…</p>
      <div v-else-if="error" class="lesson-notes-state is-error">
        <p>{{ error }}</p>
        <button class="secondary-button ui-button" type="button" aria-label="Повторить загрузку заметок" @click="loadNotes">Повторить</button>
      </div>
      <template v-else>
        <p class="lesson-notes-privacy">Заметки видны вам и администраторам клуба.</p>
        <label class="lesson-note-editor">
          <span>Новая заметка</span>
          <textarea v-model="draft" maxlength="2000" aria-label="Новая заметка" placeholder="Запишите важную мысль…"></textarea>
        </label>
        <div class="lesson-note-submit-row">
          <small>{{ draft.length }} / 2000</small>
          <button class="primary-button ui-button" type="button" :disabled="saving || !draft.trim()" aria-label="Сохранить заметку" @click="saveNote">
            {{ saving ? "Сохраняем…" : "Сохранить заметку" }}
          </button>
        </div>
        <p v-if="saveError" class="lesson-notes-save-error" role="alert">{{ saveError }}</p>
        <p v-if="!notes.length" class="lesson-notes-state">Заметок пока нет.</p>
        <div v-else class="lesson-notes-list">
          <article v-for="note in notes" :key="note.id">
            <p>{{ note.body }}</p>
            <time :datetime="note.createdAt">{{ formatDate(note.createdAt) }}</time>
          </article>
        </div>
      </template>
    </div>
  </section>
</template>
