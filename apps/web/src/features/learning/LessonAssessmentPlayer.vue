<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import type { LessonAssessmentConfig } from "@club/shared";
import { CheckCircle2, Clock3, FileUp, ListChecks, RotateCcw, Send } from "lucide-vue-next";
import { createHomeworkUpload, getLessonAssessmentStatus, saveLessonQuizDraft, startLessonQuiz, submitLessonHomework, submitLessonQuiz, type LessonAssessmentStatus, type LessonQuizAttemptResponse } from "@/api/client";

const props = defineProps<{ lessonId: string; assessment: LessonAssessmentConfig }>();
const emit = defineEmits<{ completed: [] }>();
const status = ref<LessonAssessmentStatus | null>(null);
const attempt = ref<LessonQuizAttemptResponse["attempt"] | null>(null);
const answers = reactive<Record<string, { selectedOptionIds: string[]; text: string }>>({});
const homeworkText = ref("");
const homeworkFiles = ref<File[]>([]);
const busy = ref(false);
const error = ref("");
const resultMessage = ref("");
const quizSubmissionKey = ref(crypto.randomUUID());
const homeworkSubmissionKey = ref(crypto.randomUUID());

const latestAttempt = computed(() => status.value?.attempts[0] ?? null);
const latestSubmission = computed(() => status.value?.submissions[0] ?? null);

async function loadStatus() {
  try { status.value = await getLessonAssessmentStatus(props.lessonId); } catch { /* status is supplementary */ }
}

async function startQuiz() {
  busy.value = true; error.value = ""; resultMessage.value = "";
  try {
    attempt.value = (await startLessonQuiz(props.lessonId)).attempt;
    for (const question of attempt.value.questions) {
      const saved = attempt.value.answers.find((answer) => answer.questionId === question.id);
      answers[question.id] = { selectedOptionIds: saved?.selectedOptionIds ?? [], text: saved?.text ?? "" };
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "Не удалось начать тест."; }
  finally { busy.value = false; }
}

function toggleOption(questionId: string, optionId: string, multiple: boolean) {
  const answer = answers[questionId];
  if (!answer) return;
  answer.selectedOptionIds = multiple
    ? answer.selectedOptionIds.includes(optionId) ? answer.selectedOptionIds.filter((id) => id !== optionId) : [...answer.selectedOptionIds, optionId]
    : [optionId];
  void saveDraft();
}

async function saveDraft() {
  if (!attempt.value || busy.value) return;
  try {
    await saveLessonQuizDraft(props.lessonId, attempt.value.id, attempt.value.questions.map((question) => ({ questionId: question.id, selectedOptionIds: answers[question.id]?.selectedOptionIds ?? [], text: answers[question.id]?.text.trim() || null })));
  } catch { /* a failed background save must not block final submission */ }
}

async function submitQuiz() {
  if (!attempt.value) return;
  busy.value = true; error.value = "";
  try {
    const response = await submitLessonQuiz(props.lessonId, attempt.value.id, {
      submissionKey: quizSubmissionKey.value,
      answers: attempt.value.questions.map((question) => ({ questionId: question.id, selectedOptionIds: answers[question.id]?.selectedOptionIds ?? [], text: answers[question.id]?.text.trim() || null }))
    });
    resultMessage.value = response.result.status === "pending_review" ? "Ответы отправлены на проверку." : response.result.status === "passed" ? `Тест пройден: ${response.result.percent}%` : `Результат: ${response.result.percent}%. Попробуйте ещё раз.`;
    attempt.value = null;
    quizSubmissionKey.value = crypto.randomUUID();
    await loadStatus();
    if (response.result.status === "passed") emit("completed");
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "Не удалось отправить тест."; }
  finally { busy.value = false; }
}

function selectHomeworkFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  homeworkFiles.value = [...(input.files ?? [])].slice(0, props.assessment.mode === "homework" ? props.assessment.maxAttachments : 0);
}

async function submitHomework() {
  if (props.assessment.mode !== "homework") return;
  busy.value = true; error.value = "";
  try {
    const attachments = [];
    for (const file of homeworkFiles.value) {
      const intent = await createHomeworkUpload(props.lessonId, { fileName: file.name, contentType: file.type || "application/octet-stream", sizeBytes: file.size });
      const upload = await fetch(intent.uploadUrl, { method: "PUT", headers: { "Content-Type": intent.contentType }, body: file });
      if (!upload.ok) throw new Error("Не удалось загрузить один из файлов.");
      attachments.push({ objectKey: intent.objectKey, fileName: intent.fileName, contentType: intent.contentType, sizeBytes: intent.sizeBytes });
    }
    await submitLessonHomework(props.lessonId, { submissionKey: homeworkSubmissionKey.value, text: homeworkText.value.trim() || null, attachments });
    homeworkText.value = ""; homeworkFiles.value = [];
    homeworkSubmissionKey.value = crypto.randomUUID();
    resultMessage.value = "Домашнее задание отправлено на проверку.";
    await loadStatus();
  } catch (cause) { error.value = cause instanceof Error ? cause.message : "Не удалось отправить домашнее задание."; }
  finally { busy.value = false; }
}

onMounted(loadStatus);
</script>

<template>
  <section v-if="assessment.mode !== 'none'" class="assessment-player" aria-label="Задание к уроку">
    <header><span><ListChecks aria-hidden="true" /></span><div><strong>{{ assessment.title }}</strong><small>{{ assessment.mode === "quiz" ? `Для прохождения нужно ${assessment.passingPercent}%` : "Результат проверит администратор" }}</small></div></header>
    <p v-if="assessment.instructions" class="assessment-player__instructions">{{ assessment.instructions }}</p>

    <template v-if="assessment.mode === 'quiz'">
      <div v-if="latestAttempt && !attempt" class="assessment-player__status" :class="latestAttempt.status"><CheckCircle2 v-if="latestAttempt.status === 'passed'" aria-hidden="true" /><Clock3 v-else aria-hidden="true" /><span>{{ latestAttempt.status === "passed" ? `Пройдено · ${latestAttempt.percent}%` : latestAttempt.status === "pending_review" ? "Ожидает проверки" : latestAttempt.status === "failed" ? `Не пройдено · ${latestAttempt.percent}%` : "Попытка начата" }}</span></div>
      <p v-if="latestAttempt?.reviewComment && !attempt" class="assessment-player__feedback"><strong>Комментарий проверяющего</strong>{{ latestAttempt.reviewComment }}</p>
      <template v-if="attempt">
        <article v-for="(question, index) in attempt.questions" :key="question.id" class="assessment-player__question">
          <div><small>Вопрос {{ index + 1 }} · {{ question.points }} балл.</small><strong>{{ question.prompt }}</strong></div>
          <textarea v-if="question.type === 'free_text'" v-model="answers[question.id]!.text" class="text-input" rows="4" placeholder="Напишите ответ" @blur="saveDraft"></textarea>
          <label v-for="option in question.optionsSnapshot" v-else :key="option.id" class="assessment-player__option"><input :type="question.type === 'single_choice' ? 'radio' : 'checkbox'" :name="question.id" :checked="answers[question.id]?.selectedOptionIds.includes(option.id)" @change="toggleOption(question.id, option.id, question.type === 'multiple_choice')" /><span>{{ option.text }}</span></label>
        </article>
        <button class="assessment-player__primary" type="button" :disabled="busy" @click="submitQuiz"><Send aria-hidden="true" />{{ busy ? "Отправляем…" : "Завершить тест" }}</button>
      </template>
      <button v-else-if="latestAttempt?.status !== 'passed' && latestAttempt?.status !== 'pending_review'" class="assessment-player__primary" type="button" :disabled="busy" @click="startQuiz"><RotateCcw v-if="latestAttempt" aria-hidden="true" /><ListChecks v-else aria-hidden="true" />{{ latestAttempt ? "Пройти ещё раз" : "Начать тест" }}</button>
    </template>

    <template v-else>
      <div v-if="latestSubmission" class="assessment-player__status" :class="latestSubmission.status"><CheckCircle2 v-if="latestSubmission.status === 'accepted'" aria-hidden="true" /><Clock3 v-else aria-hidden="true" /><span>{{ latestSubmission.status === "accepted" ? "Задание принято" : latestSubmission.status === "needs_revision" ? "Нужна доработка" : "Ожидает проверки" }}</span></div>
      <p v-if="latestSubmission?.reviewComment" class="assessment-player__feedback"><strong>Комментарий проверяющего</strong>{{ latestSubmission.reviewComment }}</p>
      <template v-if="latestSubmission?.status !== 'accepted' && latestSubmission?.status !== 'pending_review'">
        <textarea v-if="assessment.allowText" v-model="homeworkText" class="text-input" rows="5" placeholder="Напишите ответ"></textarea>
        <label v-if="assessment.allowAttachments" class="assessment-player__upload"><FileUp aria-hidden="true" /><span><strong>Прикрепить файлы</strong><small>До {{ assessment.maxAttachments }} файлов, каждый до 100 МБ</small></span><input type="file" multiple :accept="assessment.allowedFileKinds.map(kind => kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt').join(',')" @change="selectHomeworkFiles" /></label>
        <ul v-if="homeworkFiles.length" class="assessment-player__files"><li v-for="file in homeworkFiles" :key="`${file.name}-${file.size}`">{{ file.name }}</li></ul>
        <button class="assessment-player__primary" type="button" :disabled="busy || (!homeworkText.trim() && !homeworkFiles.length)" @click="submitHomework"><Send aria-hidden="true" />{{ busy ? "Отправляем…" : latestSubmission?.status === "needs_revision" ? "Отправить новую версию" : "Отправить на проверку" }}</button>
      </template>
    </template>
    <p v-if="resultMessage" class="assessment-player__result">{{ resultMessage }}</p><p v-if="error" class="assessment-player__error">{{ error }}</p>
  </section>
</template>

<style scoped>
.assessment-player{display:grid;gap:14px;margin-top:20px;padding:17px;border:1px solid rgba(55,223,188,.26);border-radius:23px;background:linear-gradient(145deg,rgba(9,63,52,.93),rgba(5,42,36,.92));box-shadow:0 16px 36px rgba(0,0,0,.16)}.assessment-player>header{display:flex;gap:12px;align-items:center}.assessment-player>header>span{display:grid;place-items:center;width:44px;height:44px;border-radius:15px;color:#042e27;background:#28dcb8}.assessment-player svg{width:20px;height:20px}.assessment-player>header>div{display:grid;gap:3px}.assessment-player small{color:#a7bcb6}.assessment-player__instructions{margin:0;color:#d5e5e0;line-height:1.55}.assessment-player__status{display:flex;align-items:center;gap:9px;padding:12px 14px;border-radius:14px;color:#efc86b;background:rgba(225,170,43,.11)}.assessment-player__status.passed,.assessment-player__status.accepted{color:#53e4ae;background:rgba(43,209,148,.11)}.assessment-player__status.failed,.assessment-player__status.needs_revision{color:#ff9299;background:rgba(255,103,115,.1)}.assessment-player__question{display:grid;gap:11px;padding:14px;border:1px solid rgba(255,255,255,.1);border-radius:17px;background:rgba(0,0,0,.12)}.assessment-player__question>div{display:grid;gap:5px}.assessment-player__option{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid rgba(255,255,255,.09);border-radius:13px;background:rgba(255,255,255,.025)}.assessment-player__option input{width:20px;height:20px;accent-color:#24dcb8}.assessment-player__primary{display:flex;align-items:center;justify-content:center;gap:8px;min-height:51px;border:0;border-radius:16px;color:#052f28;background:linear-gradient(135deg,#25dfba,#13cfae);font-weight:900}.assessment-player__primary:disabled{opacity:.5}.assessment-player__upload{position:relative;display:flex;align-items:center;gap:12px;padding:14px;border:1px dashed rgba(42,222,184,.45);border-radius:16px;color:#34dfbb;background:rgba(42,222,184,.06)}.assessment-player__upload span{display:grid;gap:3px}.assessment-player__upload input{position:absolute;inset:0;opacity:0}.assessment-player__files{display:grid;gap:5px;margin:0;padding-left:20px;color:#caddd7}.assessment-player__feedback{display:grid;gap:5px;margin:0;padding:13px;border-left:3px solid #e9b84a;border-radius:0 12px 12px 0;color:#dfebe7;background:rgba(233,184,74,.08)}.assessment-player__result{color:#55e4b1}.assessment-player__error{color:#ff9299}
</style>
