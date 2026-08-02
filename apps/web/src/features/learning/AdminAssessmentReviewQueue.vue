<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Check, ChevronRight, ClipboardCheck, RotateCcw, X } from "lucide-vue-next";
import { getAssessmentReviewQueue, getHomeworkReview, getQuizReview, resetQuizAttempts, reviewHomework, reviewQuiz, type AssessmentReviewQueue } from "@/api/client";

const queue = ref<AssessmentReviewQueue>({ total: 0, homework: [], quizzes: [] });
const loading = ref(true);
const busy = ref(false);
const error = ref("");
const active = ref<{ kind: "homework" | "quiz"; id: string; title: string } | null>(null);
const homework = ref<Awaited<ReturnType<typeof getHomeworkReview>> | null>(null);
const quiz = ref<Awaited<ReturnType<typeof getQuizReview>> | null>(null);
const comment = ref("");
const points = reactive<Record<string, number>>({});
const reviewIdempotencyKey = ref(crypto.randomUUID());
const reviewedQuizResult = ref<{ status: string; percent: number | null } | null>(null);
const entries = computed(() => [
  ...queue.value.homework.map((entry) => ({ ...entry, kind: "homework" as const, title: entry.lesson?.title ?? "Домашнее задание", subtitle: `${entry.user?.displayName ?? "Клиент"} · версия ${entry.version}` })),
  ...queue.value.quizzes.map((entry) => ({ ...entry, kind: "quiz" as const, title: entry.lesson?.title ?? "Тест", subtitle: `${entry.user?.displayName ?? "Клиент"} · попытка ${entry.attemptNumber}` }))
]);

async function loadQueue() {
  loading.value = true;
  try { queue.value = await getAssessmentReviewQueue(); error.value = ""; }
  catch { error.value = "Не удалось загрузить очередь проверки."; }
  finally { loading.value = false; }
}

async function openEntry(entry: (typeof entries.value)[number]) {
  active.value = { kind: entry.kind, id: entry.id, title: entry.title };
  homework.value = null; quiz.value = null; comment.value = ""; reviewedQuizResult.value = null;
  reviewIdempotencyKey.value = crypto.randomUUID();
  try {
    if (entry.kind === "homework") homework.value = await getHomeworkReview(entry.id);
    else {
      quiz.value = await getQuizReview(entry.id);
      for (const question of quiz.value.questions.filter((question) => question.type === "free_text")) points[question.id] = 0;
    }
  } catch { error.value = "Не удалось открыть работу."; active.value = null; }
}

async function submitHomeworkReview(decision: "accepted" | "needs_revision") {
  if (!active.value || (decision === "needs_revision" && !comment.value.trim())) return;
  busy.value = true;
  try { await reviewHomework(active.value.id, { decision, comment: comment.value.trim() || null, idempotencyKey: reviewIdempotencyKey.value }); active.value = null; await loadQueue(); }
  catch { error.value = "Не удалось сохранить проверку."; }
  finally { busy.value = false; }
}

async function submitQuizReview() {
  if (!active.value || !quiz.value) return;
  busy.value = true;
  try {
    const response = await reviewQuiz(active.value.id, { questionPoints: { ...points }, comment: comment.value.trim() || null, idempotencyKey: reviewIdempotencyKey.value });
    reviewedQuizResult.value = response.result;
    await loadQueue();
    if (response.result.status === "passed") active.value = null;
  }
  catch { error.value = "Не удалось сохранить проверку."; }
  finally { busy.value = false; }
}

async function grantMoreQuizAttempts() {
  if (!active.value) return;
  busy.value = true;
  try { await resetQuizAttempts(active.value.id, comment.value.trim() || null); active.value = null; await loadQueue(); }
  catch { error.value = "Не удалось разрешить новые попытки."; }
  finally { busy.value = false; }
}

onMounted(loadQueue);
defineExpose({ loadQueue });
</script>

<template>
  <section class="review-queue" aria-label="Работы на проверку">
    <header><div><span><ClipboardCheck aria-hidden="true" /></span><div><strong>Работы на проверку</strong><small>Тесты со свободным ответом и домашние задания</small></div></div><b v-if="queue.total">{{ queue.total }}</b></header>
    <p v-if="loading" class="review-queue__muted">Загружаем очередь…</p>
    <p v-else-if="error" class="review-queue__error">{{ error }}</p>
    <p v-else-if="!entries.length" class="review-queue__muted">Новых работ пока нет.</p>
    <button v-for="entry in entries" v-else :key="`${entry.kind}-${entry.id}`" class="review-queue__entry" type="button" @click="openEntry(entry)"><span><strong>{{ entry.title }}</strong><small>{{ entry.subtitle }}</small></span><ChevronRight aria-hidden="true" /></button>

    <Teleport to="body">
      <div v-if="active" class="review-sheet" role="dialog" aria-modal="true" :aria-label="`Проверка: ${active.title}`">
        <div class="review-sheet__panel">
        <header><div><strong>{{ active.title }}</strong><small>{{ active.kind === "homework" ? "Домашнее задание" : "Тест со свободным ответом" }}</small></div><button type="button" aria-label="Закрыть проверку" @click="active = null"><X aria-hidden="true" /></button></header>
        <template v-if="homework">
          <p class="review-sheet__answer">{{ homework.submission.text || "Текстовый ответ не добавлен." }}</p>
          <a v-for="file in homework.attachments" :key="file.id" class="review-sheet__file" :href="file.url" target="_blank" rel="noopener">{{ file.fileName }} <small>{{ Math.ceil(file.sizeBytes / 1024) }} КБ</small></a>
        </template>
        <template v-if="quiz">
          <article v-for="question in quiz.questions" :key="question.id" class="review-sheet__question"><strong>{{ question.prompt }}</strong><p v-if="question.type === 'free_text'">{{ question.answer?.text || "Нет ответа" }}</p><p v-else>{{ question.optionsSnapshot.filter(option => question.answer?.selectedOptionIds.includes(option.id)).map(option => option.text).join(", ") || "Нет ответа" }}</p><label v-if="question.type === 'free_text'"><span>Баллы из {{ question.points }}</span><input v-model.number="points[question.id]" class="text-input" type="number" min="0" :max="question.points" /></label></article>
        </template>
        <label class="review-sheet__comment"><span>Комментарий клиенту</span><textarea v-model="comment" class="text-input" rows="3" placeholder="Необязательно при принятии"></textarea></label>
        <div v-if="active.kind === 'homework'" class="review-sheet__actions"><button type="button" class="review-sheet__revision" :disabled="busy || !comment.trim()" @click="submitHomeworkReview('needs_revision')"><RotateCcw aria-hidden="true" />На доработку</button><button type="button" class="review-sheet__accept" :disabled="busy" @click="submitHomeworkReview('accepted')"><Check aria-hidden="true" />Принять</button></div>
        <template v-else-if="reviewedQuizResult?.status === 'failed'">
          <p class="review-sheet__answer">Тест не пройден · {{ reviewedQuizResult.percent }}%. Можно разрешить клиенту новый набор попыток.</p>
          <div class="review-sheet__actions"><button type="button" class="review-sheet__revision" :disabled="busy" @click="active = null"><X aria-hidden="true" />Закрыть</button><button type="button" class="review-sheet__accept" :disabled="busy" @click="grantMoreQuizAttempts"><RotateCcw aria-hidden="true" />Дать попытки</button></div>
        </template>
          <div v-else class="review-sheet__wide-action"><button class="review-sheet__accept review-sheet__accept--wide" type="button" :disabled="busy || !quiz" @click="submitQuizReview"><Check aria-hidden="true" />Сохранить проверку</button></div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.review-queue{display:grid;gap:10px;padding:15px;border:1px solid rgba(45,220,185,.22);border-radius:22px;background:rgba(5,47,40,.72)}.review-queue>header,.review-queue>header>div{display:flex;align-items:center;justify-content:space-between;gap:11px}.review-queue>header>div>span{display:grid;place-items:center;width:42px;height:42px;border-radius:14px;color:#25dbb7;background:rgba(37,219,183,.12)}.review-queue>header>div>div,.review-queue__entry>span{display:grid;gap:3px}.review-queue small,.review-queue__muted{color:#9db7b0}.review-queue>header b{display:grid;place-items:center;min-width:31px;height:31px;border-radius:999px;color:#062f28;background:#2cddb9}.review-queue__entry{display:flex;align-items:center;justify-content:space-between;padding:13px;border:1px solid rgba(255,255,255,.09);border-radius:15px;color:inherit;text-align:left;background:rgba(255,255,255,.025)}.review-queue__entry>svg{width:19px;color:#24dcb7}.review-queue__error{color:#ff8d95}.review-sheet{position:fixed;z-index:1900;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-top:max(60px,var(--club-safe-top,env(safe-area-inset-top,0px)));background:rgba(0,15,12,.72);backdrop-filter:blur(8px);overscroll-behavior:contain}.review-sheet__panel{display:grid;gap:13px;width:min(620px,100%);max-height:calc(100dvh - max(60px,var(--club-safe-top,env(safe-area-inset-top,0px))));padding:19px 19px calc(19px + var(--club-safe-bottom,env(safe-area-inset-bottom,0px)));overflow:auto;overscroll-behavior:contain;border:1px solid color-mix(in srgb,var(--accent) 30%,var(--border));border-radius:26px 26px 0 0;background:var(--surface)}.review-sheet__panel>header{display:flex;align-items:center;justify-content:space-between}.review-sheet__panel>header>div{display:grid;gap:3px}.review-sheet__panel>header button{display:grid;place-items:center;width:44px;height:44px;border:1px solid var(--border);border-radius:14px;color:var(--text);background:transparent}.review-sheet__answer,.review-sheet__question{padding:14px;border:1px solid var(--border);border-radius:15px;background:var(--field);line-height:1.55}.review-sheet__file{padding:12px;border-radius:13px;color:var(--accent);background:var(--accent-soft)}.review-sheet__question{display:grid;gap:9px}.review-sheet__question p{margin:0}.review-sheet__question label,.review-sheet__comment{display:grid;gap:6px}.review-sheet__actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}.review-sheet__actions,.review-sheet__wide-action{position:sticky;z-index:2;bottom:calc(-19px - var(--club-safe-bottom,env(safe-area-inset-bottom,0px)));margin:0 -19px -19px;padding:9px 19px calc(19px + var(--club-safe-bottom,env(safe-area-inset-bottom,0px)));background:var(--surface)}.review-sheet__actions button,.review-sheet__accept--wide{display:flex;min-height:50px;align-items:center;justify-content:center;gap:8px;border:0;border-radius:15px;font-weight:850}.review-sheet__actions svg,.review-sheet__accept--wide svg{width:19px}.review-sheet__revision{color:var(--danger-text);background:color-mix(in srgb,var(--danger) 14%,var(--surface))}.review-sheet__accept{color:var(--accent-text);background:var(--accent)}.review-sheet__accept--wide{width:100%}.review-sheet button:disabled{opacity:.45}
</style>
