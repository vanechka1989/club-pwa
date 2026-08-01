<script setup lang="ts">
import { ref, watch } from "vue";
import type { LessonAssessmentDraft, QuizQuestionDraft, QuizQuestionType } from "@club/shared";
import { ListChecks, ClipboardCheck, FileCheck2, Plus, Trash2 } from "lucide-vue-next";

const props = defineProps<{ modelValue: LessonAssessmentDraft }>();
const emit = defineEmits<{ "update:modelValue": [value: LessonAssessmentDraft] }>();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function cloneForEditor(value: LessonAssessmentDraft): LessonAssessmentDraft {
  const result = clone(value);
  if (result.mode !== "homework" || !result.dueAt || !result.dueAt.endsWith("Z")) return result;
  const date = new Date(result.dueAt);
  const pad = (part: number) => String(part).padStart(2, "0");
  result.dueAt = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return result;
}

const draft = ref<LessonAssessmentDraft>(cloneForEditor(props.modelValue));
let syncing = false;

watch(() => props.modelValue, (value) => {
  syncing = true;
  draft.value = cloneForEditor(value);
  queueMicrotask(() => { syncing = false; });
}, { deep: true });

watch(draft, (value) => {
  if (!syncing) emit("update:modelValue", clone(value));
}, { deep: true });

function id(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function setMode(mode: LessonAssessmentDraft["mode"]) {
  if (mode === "none") draft.value = { mode: "none" };
  if (mode === "quiz") draft.value = {
    mode: "quiz",
    title: "Тест к уроку",
    instructions: null,
    passingPercent: 70,
    maxAttempts: 3,
    questions: []
  };
  if (mode === "homework") draft.value = {
    mode: "homework",
    title: "Домашнее задание",
    instructions: "Выполните задание и отправьте результат на проверку.",
    dueAt: null,
    allowText: true,
    allowAttachments: false,
    allowedFileKinds: ["image", "document"],
    maxAttachments: 5
  };
}

function addQuestion() {
  if (draft.value.mode !== "quiz") return;
  draft.value.questions.push({
    id: id("question"),
    type: "single_choice",
    prompt: "",
    points: 1,
    options: [
      { id: id("option"), text: "" },
      { id: id("option"), text: "" }
    ],
    correctOptionIds: []
  });
}

function setQuestionType(question: QuizQuestionDraft, type: QuizQuestionType) {
  question.type = type;
  question.correctOptionIds = [];
  if (type === "free_text") question.options = [];
  if (type !== "free_text" && question.options.length < 2) {
    question.options = [{ id: id("option"), text: "" }, { id: id("option"), text: "" }];
  }
}

function addOption(question: QuizQuestionDraft) {
  question.options.push({ id: id("option"), text: "" });
}

function removeOption(question: QuizQuestionDraft, optionId: string) {
  if (question.options.length <= 2) return;
  question.options = question.options.filter((option) => option.id !== optionId);
  question.correctOptionIds = question.correctOptionIds.filter((id) => id !== optionId);
}

function toggleCorrect(question: QuizQuestionDraft, optionId: string) {
  if (question.type === "single_choice") {
    question.correctOptionIds = [optionId];
  } else if (question.type === "multiple_choice") {
    question.correctOptionIds = question.correctOptionIds.includes(optionId)
      ? question.correctOptionIds.filter((id) => id !== optionId)
      : [...question.correctOptionIds, optionId];
  }
}
</script>

<template>
  <section class="assessment-editor" aria-label="Проверка знаний">
    <header class="assessment-editor__header">
      <span class="assessment-editor__icon"><ClipboardCheck aria-hidden="true" /></span>
      <div>
        <strong>Проверка знаний</strong>
        <small>Урок завершится только после успешного результата.</small>
      </div>
    </header>

    <div class="assessment-editor__modes" role="group" aria-label="Тип задания">
      <button type="button" :class="{ active: draft.mode === 'none' }" @click="setMode('none')">Без задания</button>
      <button type="button" :class="{ active: draft.mode === 'quiz' }" @click="setMode('quiz')"><ListChecks aria-hidden="true" />Тест</button>
      <button type="button" :class="{ active: draft.mode === 'homework' }" @click="setMode('homework')"><FileCheck2 aria-hidden="true" />Домашнее задание</button>
    </div>

    <div v-if="draft.mode !== 'none'" class="assessment-editor__body">
      <label><span>Название</span><input v-model.trim="draft.title" class="text-input" maxlength="180" /></label>
      <label><span>Инструкция</span><textarea v-model.trim="draft.instructions" class="text-input" rows="3"></textarea></label>

      <template v-if="draft.mode === 'quiz'">
        <div class="assessment-editor__numbers">
          <label><span>Проходной балл, %</span><input v-model.number="draft.passingPercent" class="text-input" type="number" min="1" max="100" /></label>
          <label><span>Количество попыток</span><input v-model.number="draft.maxAttempts" class="text-input" type="number" min="1" max="100" /></label>
        </div>

        <article v-for="(question, questionIndex) in draft.questions" :key="question.id" class="assessment-question">
          <header><strong>Вопрос {{ questionIndex + 1 }}</strong><button type="button" aria-label="Удалить вопрос" @click="draft.questions.splice(questionIndex, 1)"><Trash2 aria-hidden="true" /></button></header>
          <label><span>Текст вопроса</span><textarea v-model.trim="question.prompt" class="text-input" rows="2"></textarea></label>
          <div class="assessment-question__row">
            <label><span>Тип ответа</span><select class="text-input" :value="question.type" @change="setQuestionType(question, ($event.target as HTMLSelectElement).value as QuizQuestionType)"><option value="single_choice">Один вариант</option><option value="multiple_choice">Несколько вариантов</option><option value="free_text">Свободный текст</option></select></label>
            <label><span>Баллы</span><input v-model.number="question.points" class="text-input" type="number" min="1" max="1000" /></label>
          </div>
          <div v-if="question.type !== 'free_text'" class="assessment-options">
            <small>Отметьте правильный ответ</small>
            <div v-for="option in question.options" :key="option.id" class="assessment-option">
              <input :type="question.type === 'single_choice' ? 'radio' : 'checkbox'" :name="question.id" :checked="question.correctOptionIds.includes(option.id)" :aria-label="`Правильный вариант ${option.text || 'без текста'}`" @change="toggleCorrect(question, option.id)" />
              <input v-model.trim="option.text" class="text-input" placeholder="Вариант ответа" maxlength="500" />
              <button type="button" aria-label="Удалить вариант" :disabled="question.options.length <= 2" @click="removeOption(question, option.id)"><Trash2 aria-hidden="true" /></button>
            </div>
            <button class="assessment-editor__add" type="button" @click="addOption(question)"><Plus aria-hidden="true" />Добавить вариант</button>
          </div>
        </article>
        <button class="assessment-editor__add assessment-editor__add--primary" type="button" @click="addQuestion"><Plus aria-hidden="true" />Добавить вопрос</button>
      </template>

      <template v-else>
        <label><span>Срок сдачи <small>(не обязательно)</small></span><input v-model="draft.dueAt" class="text-input" type="datetime-local" /></label>
        <div class="assessment-homework-methods">
          <label><input v-model="draft.allowText" type="checkbox" />Текстовый ответ</label>
          <label><input v-model="draft.allowAttachments" type="checkbox" />Файлы</label>
        </div>
        <template v-if="draft.allowAttachments">
          <div class="assessment-homework-methods"><label><input v-model="draft.allowedFileKinds" type="checkbox" value="image" />Фото</label><label><input v-model="draft.allowedFileKinds" type="checkbox" value="document" />Документы</label><label><input v-model="draft.allowedFileKinds" type="checkbox" value="video" />Видео</label></div>
          <label><span>Максимум файлов</span><input v-model.number="draft.maxAttachments" class="text-input" type="number" min="1" max="10" /></label>
        </template>
      </template>
    </div>
  </section>
</template>

<style scoped>
.assessment-editor{display:grid;gap:14px;padding:16px;border:1px solid rgba(98,236,204,.22);border-radius:22px;background:linear-gradient(145deg,rgba(6,54,45,.82),rgba(4,36,31,.76))}.assessment-editor__header{display:flex;gap:12px;align-items:center}.assessment-editor__header>div{display:grid;gap:3px}.assessment-editor__header small,.assessment-options>small{color:var(--text-muted,#9db8b0)}.assessment-editor__icon{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;color:#18d8b3;background:rgba(24,216,179,.13)}.assessment-editor__icon svg,.assessment-editor__modes svg,.assessment-editor__add svg,.assessment-question button svg{width:18px;height:18px}.assessment-editor__modes{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.assessment-editor__modes button{display:flex;min-height:48px;gap:7px;align-items:center;justify-content:center;padding:9px;border:1px solid rgba(164,207,196,.18);border-radius:15px;color:#b8cbc5;background:rgba(255,255,255,.025);font-weight:700}.assessment-editor__modes button.active{border-color:#19d8b4;color:#042f28;background:#24d9b6}.assessment-editor__body,.assessment-editor__body label{display:grid;gap:7px}.assessment-editor__numbers,.assessment-question__row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.assessment-question{display:grid;gap:12px;padding:14px;border:1px solid rgba(255,255,255,.1);border-radius:18px;background:rgba(0,0,0,.12)}.assessment-question>header,.assessment-option{display:flex;gap:9px;align-items:center}.assessment-question>header{justify-content:space-between}.assessment-question button,.assessment-option button{display:grid;place-items:center;min-width:38px;height:38px;border:0;border-radius:12px;color:#ff7c86;background:rgba(255,91,105,.1)}.assessment-options{display:grid;gap:9px}.assessment-option>.text-input{flex:1}.assessment-option>input:first-child{width:20px;height:20px;accent-color:#20dcb8}.assessment-editor__add{display:flex;align-items:center;justify-content:center;gap:7px;min-height:44px;border:1px dashed rgba(32,220,184,.45);border-radius:14px;color:#25dbb8;background:rgba(32,220,184,.06);font-weight:800}.assessment-editor__add--primary{border-style:solid}.assessment-homework-methods{display:flex;flex-wrap:wrap;gap:9px}.assessment-homework-methods label{display:flex;grid-auto-flow:column;align-items:center;gap:8px;padding:11px 13px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:rgba(255,255,255,.025)}.assessment-homework-methods input{width:19px;height:19px;accent-color:#20dcb8}@media(max-width:540px){.assessment-editor__modes{grid-template-columns:1fr}.assessment-editor__numbers,.assessment-question__row{grid-template-columns:1fr}}
</style>
