<script setup lang="ts">
import { computed } from "vue";
import type { LessonAssessmentDraft } from "@club/shared";
import { ArrowLeft, ClipboardCheck, RotateCcw, Save } from "lucide-vue-next";
import LessonAssessmentEditor from "./LessonAssessmentEditor.vue";

const props = withDefaults(defineProps<{
  lessonTitle: string;
  modelValue: LessonAssessmentDraft;
  loading: boolean;
  saving: boolean;
  error: string;
  retryable?: boolean;
}>(), {
  retryable: false
});

const emit = defineEmits<{
  "update:modelValue": [value: LessonAssessmentDraft];
  save: [];
  back: [];
  retry: [];
}>();

const modeLabel = computed(() => props.modelValue.mode === "quiz"
  ? "Тест"
  : props.modelValue.mode === "homework"
    ? "Домашнее задание"
    : "Не добавлена");
</script>

<template>
  <section class="assessment-settings-page" aria-label="Настройка проверки знаний">
    <button class="assessment-settings-page__back" type="button" @click="emit('back')">
      <ArrowLeft aria-hidden="true" />
      Назад к уроку
    </button>

    <header class="assessment-settings-page__header">
      <span class="assessment-settings-page__icon"><ClipboardCheck aria-hidden="true" /></span>
      <div>
        <small>Проверка знаний</small>
        <h3>{{ lessonTitle }}</h3>
        <span class="assessment-settings-page__status">{{ modeLabel }}</span>
      </div>
    </header>

    <div v-if="loading" class="assessment-settings-page__state" role="status">
      Загружаем настройки…
    </div>

    <template v-else>
      <div v-if="error" class="assessment-settings-page__state assessment-settings-page__state--error" role="alert">
        <p>{{ error }}</p>
        <button v-if="retryable" type="button" @click="emit('retry')"><RotateCcw aria-hidden="true" />Повторить</button>
      </div>

      <LessonAssessmentEditor
        v-if="!error || !retryable"
        :model-value="modelValue"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <button v-if="!error || !retryable" class="assessment-settings-page__save" type="button" :disabled="saving" @click="emit('save')">
        <Save aria-hidden="true" />
        {{ saving ? "Сохраняем…" : "Сохранить проверку" }}
      </button>
    </template>
  </section>
</template>

<style scoped>
.assessment-settings-page{display:grid;gap:16px;width:min(760px,100%);margin:0 auto;padding:4px 0 max(24px,env(safe-area-inset-bottom))}.assessment-settings-page__back{display:flex;align-items:center;gap:8px;width:max-content;min-height:44px;padding:0 12px;border:1px solid var(--border);border-radius:14px;color:var(--muted-strong);background:var(--surface-3);font-weight:750}.assessment-settings-page__back svg{width:18px}.assessment-settings-page__header{display:flex;align-items:center;gap:14px;padding:4px}.assessment-settings-page__icon{display:grid;place-items:center;flex:0 0 52px;width:52px;height:52px;border-radius:16px;color:var(--accent-text);background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 78%,#0ea58c))}.assessment-settings-page__icon svg{width:25px}.assessment-settings-page__header>div{display:grid;gap:3px;min-width:0}.assessment-settings-page__header small{color:var(--muted);font-weight:750}.assessment-settings-page__header h3{margin:0;overflow:hidden;color:var(--text);font-size:1.2rem;text-overflow:ellipsis;white-space:nowrap}.assessment-settings-page__status{width:max-content;padding:4px 9px;border-radius:999px;color:var(--accent);background:var(--accent-soft);font-size:.78rem;font-weight:850}.assessment-settings-page__state{display:grid;place-items:center;min-height:180px;padding:24px;border:1px solid var(--border);border-radius:18px;color:var(--muted);background:var(--surface-2);text-align:center}.assessment-settings-page__state--error{gap:12px;min-height:auto;border-color:color-mix(in srgb,var(--danger) 36%,var(--border));color:var(--danger-text);background:var(--danger-soft)}.assessment-settings-page__state p{margin:0}.assessment-settings-page__state button,.assessment-settings-page__save{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border:0;border-radius:15px;font-weight:900}.assessment-settings-page__state button{padding:0 18px;color:var(--accent-text);background:var(--accent)}.assessment-settings-page__state button svg,.assessment-settings-page__save svg{width:19px}.assessment-settings-page__save{position:sticky;z-index:2;bottom:max(12px,env(safe-area-inset-bottom));width:100%;color:var(--accent-text);background:linear-gradient(135deg,var(--accent),color-mix(in srgb,var(--accent) 78%,#0ea58c));box-shadow:0 14px 34px color-mix(in srgb,var(--accent) 18%,transparent)}.assessment-settings-page__save:disabled{opacity:.55}
@media (min-width:768px){.assessment-settings-page{padding-top:8px}.assessment-settings-page__save{position:static}}
</style>
