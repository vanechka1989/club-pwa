<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { LessonAssessmentConfig } from "@club/shared";
import { ArrowRight, CheckCircle2, ClipboardCheck, FileCheck2 } from "lucide-vue-next";
import { getLessonAssessmentStatus, type LessonAssessmentStatus } from "@/api/client";

const props = defineProps<{ lessonId: string; assessment: LessonAssessmentConfig }>();
const emit = defineEmits<{ open: [] }>();
const status = ref<LessonAssessmentStatus | null>(null);

const latestAttempt = computed(() => status.value?.attempts[0] ?? null);
const latestSubmission = computed(() => status.value?.submissions[0] ?? null);
const title = computed(() => props.assessment.mode === "quiz" ? "Пройти тест" : "Сдать домашнее задание");
const assessmentTitle = computed(() => props.assessment.mode === "none" ? "Проверка знаний" : props.assessment.title);
const eyebrow = computed(() => props.assessment.mode === "quiz" ? "Тест к уроку" : "Домашнее задание");
const state = computed(() => {
  if (props.assessment.mode === "quiz") {
    if (latestAttempt.value?.status === "passed") return `Пройдено · ${latestAttempt.value.percent ?? 0}%`;
    if (latestAttempt.value?.status === "pending_review") return "Ответы проверяются";
    if (latestAttempt.value?.status === "failed") return `Последний результат · ${latestAttempt.value.percent ?? 0}%`;
    return `Нужно набрать ${props.assessment.passingPercent}%`;
  }
  if (latestSubmission.value?.status === "accepted") return "Задание принято";
  if (latestSubmission.value?.status === "pending_review") return "Отправлено на проверку";
  if (latestSubmission.value?.status === "needs_revision") return "Нужна доработка";
  return "Откроется на отдельной странице";
});
const complete = computed(() => latestAttempt.value?.status === "passed" || latestSubmission.value?.status === "accepted");

onMounted(async () => {
  try { status.value = await getLessonAssessmentStatus(props.lessonId); } catch { /* card remains actionable */ }
});
</script>

<template>
  <button class="assessment-entry" :class="{ complete }" type="button" @click="emit('open')">
    <span class="assessment-entry__icon">
      <CheckCircle2 v-if="complete" aria-hidden="true" />
      <ClipboardCheck v-else-if="assessment.mode === 'quiz'" aria-hidden="true" />
      <FileCheck2 v-else aria-hidden="true" />
    </span>
    <span class="assessment-entry__copy">
      <small>{{ eyebrow }}</small>
      <strong>{{ complete ? assessmentTitle : title }}</strong>
      <span>{{ state }}</span>
    </span>
    <ArrowRight class="assessment-entry__arrow" aria-hidden="true" />
  </button>
</template>

<style scoped>
.assessment-entry{display:grid;grid-template-columns:48px minmax(0,1fr) 24px;align-items:center;gap:13px;width:100%;margin-top:20px;padding:15px;border:1px solid rgba(46,224,188,.36);border-radius:20px;color:#eefbf7;text-align:left;background:linear-gradient(135deg,rgba(10,87,71,.96),rgba(7,61,51,.96));box-shadow:0 15px 34px rgba(0,0,0,.18);cursor:pointer}.assessment-entry__icon{display:grid;place-items:center;width:48px;height:48px;border-radius:16px;color:#04352c;background:linear-gradient(135deg,#39e5c1,#1dcaa8)}.assessment-entry__icon svg{width:24px;height:24px}.assessment-entry__copy{display:grid;gap:3px;min-width:0}.assessment-entry__copy small{color:#66e8ca;font-size:.72rem;font-weight:800;text-transform:uppercase;letter-spacing:.055em}.assessment-entry__copy strong{font-size:1rem}.assessment-entry__copy>span{color:#b8cdc7;font-size:.82rem}.assessment-entry__arrow{width:20px;height:20px;color:#42dfbe}.assessment-entry.complete{border-color:rgba(80,225,171,.3);background:linear-gradient(135deg,rgba(12,78,62,.94),rgba(7,57,47,.94))}
</style>
