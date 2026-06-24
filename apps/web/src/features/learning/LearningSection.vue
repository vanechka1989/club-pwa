<script setup lang="ts">
import type { LearningContent, LearningCategory, LessonComment } from "@club/shared";
import { CheckCircle2, Image, Loader2, Music, Play, Type } from "lucide-vue-next";
import { computed, onMounted, ref, watch } from "vue";
import {
  completeLearningContent,
  createLessonComment,
  getLearningContent,
  getLearningHome,
  getLessonComments,
  saveLearningPlayback
} from "@/api/client";
import { formatMembershipStatus, useI18n } from "@/features/app/i18n";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const { t } = useI18n();

const categories = ref<LearningCategory[]>([]);
const featured = ref<LearningContent[]>([]);
const lastOpenedItem = ref<LearningContent | null>(null);
const totalItems = ref(0);
const completedItems = ref(0);
const selectedItem = ref<LearningContent | null>(null);
const selectedCompletedAt = ref<string | null>(null);
const selectedPlaybackPosition = ref(0);
const comments = ref<LessonComment[]>([]);
const commentBody = ref("");
const loading = ref(false);
const itemLoading = ref(false);
const completeLoading = ref(false);
const commentSaving = ref(false);
const error = ref<string | null>(null);
const accessDenied = ref(false);
const imageViewerUrl = ref<string | null>(null);
const videoViewerUrl = ref<string | null>(null);
const hasLearningAccess = computed(
  () => session.user?.role === "admin" || session.user?.role === "owner" || session.user?.membershipStatus === "active"
);

const selectedIcon = computed(() => {
  if (selectedItem.value?.kind === "photo") {
    return Image;
  }

  if (selectedItem.value?.kind === "video") {
    return Play;
  }

  if (selectedItem.value?.kind === "audio") {
    return Music;
  }

  return Type;
});

const progressPercent = computed(() => {
  if (!totalItems.value) {
    return 0;
  }

  return Math.min(100, Math.round((completedItems.value / totalItems.value) * 100));
});
const materialsByCategory = computed(() =>
  categories.value
    .map((category) => ({
      category,
      items: featured.value.filter((item) => item.categoryId === category.id)
    }))
    .filter((group) => group.items.length)
);

function iconFor(kind: LearningContent["kind"]) {
  if (kind === "photo") {
    return Image;
  }

  if (kind === "video") {
    return Play;
  }

  if (kind === "audio") {
    return Music;
  }

  return Type;
}

async function loadLearning() {
  if (!hasLearningAccess.value) {
    accessDenied.value = true;
    return;
  }

  loading.value = true;
  error.value = null;
  accessDenied.value = false;

  try {
    const response = await getLearningHome();
    categories.value = response.categories;
    featured.value = response.featured;
    lastOpenedItem.value = response.progress.lastOpenedItem;
    totalItems.value = response.progress.totalItems;
    completedItems.value = response.progress.completedItems;
  } catch (reason) {
    const status = typeof reason === "object" && reason && "status" in reason ? reason.status : null;
    if (status === 403) {
      accessDenied.value = true;
      return;
    }

    error.value = t("learningError");
  } finally {
    loading.value = false;
  }
}

async function openItem(item: LearningContent) {
  if (selectedItem.value?.id === item.id) {
    selectedItem.value = null;
    selectedCompletedAt.value = null;
    selectedPlaybackPosition.value = 0;
    comments.value = [];
    return;
  }

  selectedItem.value = null;
  selectedCompletedAt.value = null;
  selectedPlaybackPosition.value = 0;
  comments.value = [];
  accessDenied.value = false;
  itemLoading.value = true;

  try {
    const response = await getLearningContent(item.id);
    selectedItem.value = response.item;
    selectedCompletedAt.value = response.completedAt;
    selectedPlaybackPosition.value = response.playbackPositionSeconds;
    lastOpenedItem.value = response.item;
    await loadComments(response.item.id);
  } catch (reason) {
    const status = typeof reason === "object" && reason && "status" in reason ? reason.status : null;
    if (status === 403) {
      accessDenied.value = true;
      return;
    }

    error.value = t("itemError");
  } finally {
    itemLoading.value = false;
  }
}

function isSelectedItem(item: LearningContent) {
  return selectedItem.value?.id === item.id;
}

function applySavedPlayback(event: Event) {
  if (!selectedItem.value || !["video", "audio"].includes(selectedItem.value.kind) || selectedPlaybackPosition.value <= 1) {
    return;
  }

  const element = event.target as HTMLMediaElement;
  if (Number.isFinite(element.duration) && selectedPlaybackPosition.value < element.duration - 2) {
    element.currentTime = selectedPlaybackPosition.value;
  }
}

async function persistPlayback(positionSeconds: number) {
  if (!selectedItem.value || !["video", "audio"].includes(selectedItem.value.kind)) {
    return;
  }

  const rounded = Math.max(0, Math.floor(positionSeconds));
  selectedPlaybackPosition.value = rounded;
  await saveLearningPlayback(selectedItem.value.id, rounded).catch(() => null);
}

let lastPlaybackSyncAt = 0;

function handlePlaybackTimeUpdate(event: Event) {
  const now = Date.now();
  if (now - lastPlaybackSyncAt < 5000) {
    return;
  }

  lastPlaybackSyncAt = now;
  void persistPlayback((event.target as HTMLMediaElement).currentTime);
}

function handlePlaybackPause(event: Event) {
  void persistPlayback((event.target as HTMLMediaElement).currentTime);
}

function handlePlaybackEnded() {
  void persistPlayback(0);
}

function openImageViewer(url: string) {
  imageViewerUrl.value = url;
}

function closeImageViewer() {
  imageViewerUrl.value = null;
}

function openVideoViewer(url: string) {
  videoViewerUrl.value = url;
}

function closeVideoViewer() {
  videoViewerUrl.value = null;
}

async function loadComments(itemId: string) {
  const response = await getLessonComments(itemId);
  comments.value = response.comments;
}

async function handleCreateComment() {
  if (!selectedItem.value || !commentBody.value.trim()) {
    return;
  }

  commentSaving.value = true;
  try {
    const response = await createLessonComment(selectedItem.value.id, commentBody.value);
    comments.value = [response.comment, ...comments.value];
    commentBody.value = "";
  } finally {
    commentSaving.value = false;
  }
}

async function markSelectedComplete() {
  if (!selectedItem.value) {
    return;
  }

  completeLoading.value = true;

  try {
    const response = await completeLearningContent(selectedItem.value.id);
    selectedCompletedAt.value = response.completedAt;
    await loadLearning();
  } finally {
    completeLoading.value = false;
  }
}

onMounted(() => {
  void loadLearning();
});

watch(hasLearningAccess, (hasAccess) => {
  if (!hasAccess) {
    categories.value = [];
    featured.value = [];
    selectedItem.value = null;
    accessDenied.value = true;
    return;
  }

  void loadLearning();
});
</script>

<template>
  <section class="space-y-5">
    <div class="section-head">
      <div>
        <h2 class="section-title">Обучение</h2>
        <p class="section-subtitle">Контент клуба и ваш прогресс.</p>
      </div>
    </div>

    <div v-if="!hasLearningAccess || accessDenied" class="access-lock-card">
      <strong>Обучение закрыто</strong>
      <span>Контент доступен после активации подписки.</span>
    </div>

    <div v-else-if="loading" class="flex items-center gap-2 text-sm text-[var(--muted)]">
      <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
      {{ t("learningLoading") }}
    </div>

    <p v-else-if="error" class="text-sm text-[var(--danger)]">{{ error }}</p>

    <div v-else class="space-y-5">
      <div class="surface-card">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm text-[var(--muted)]">{{ t("learningProgress") }}</p>
            <p class="mt-1 text-lg font-semibold text-[var(--text)]">
              {{ completedItems }} / {{ totalItems }}
            </p>
          </div>
          <span class="role-badge">{{ progressPercent }}%</span>
        </div>
        <div class="mt-3 h-2 overflow-hidden rounded-full bg-[var(--border)]">
          <div class="h-full rounded-full bg-[var(--accent)]" :style="{ width: `${progressPercent}%` }"></div>
        </div>
        <button
          v-if="lastOpenedItem"
          class="mt-4 w-full rounded-lg border border-[var(--border)] p-3 text-left"
          type="button"
          @click="openItem(lastOpenedItem)"
        >
          <p class="text-xs font-semibold text-[var(--muted)]">{{ t("lastOpenedLesson") }}</p>
          <p class="mt-1 font-semibold text-[var(--text)]">{{ lastOpenedItem.title }}</p>
        </button>
      </div>

      <div class="space-y-3">
        <h3 class="font-semibold text-[var(--text)]">Контент</h3>

        <div v-if="materialsByCategory.length" class="grid gap-4">
          <section v-for="group in materialsByCategory" :key="group.category.id" class="surface-card">
            <p class="text-sm text-[var(--muted)]">{{ group.category.itemsCount }} {{ t("materialsCount") }}</p>
            <h4 class="mt-1 font-semibold text-[var(--text)]">{{ group.category.title }}</h4>
            <p v-if="group.category.description" class="mt-1 text-sm leading-6 text-[var(--muted)]">{{ group.category.description }}</p>

            <div class="mt-3 grid gap-2">
              <button
                v-for="item in group.items"
                :key="item.id"
                class="rounded-xl border border-[var(--border)] bg-[var(--panel-soft)] p-3 text-left transition hover:opacity-90"
                type="button"
                @click="openItem(item)"
              >
                <div class="flex items-start gap-3">
                  <span class="learning-content-thumb">
                    <img v-if="item.kind === 'photo' && item.mediaUrl" :src="item.mediaUrl" :alt="item.title" />
                    <component v-else :is="iconFor(item.kind)" class="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <strong class="block text-sm text-[var(--text)]">{{ item.title }}</strong>
                    <small class="mt-1 block leading-5 text-[var(--muted)]">{{ item.summary }}</small>
                  </span>
                  <span v-if="isSelectedItem(item)" class="ml-auto shrink-0 text-xs font-bold text-[var(--accent)]">Открыто</span>
                </div>
              </button>
            </div>
          </section>
        </div>

        <p v-else class="text-sm text-[var(--muted)]">{{ t("emptyMaterials") }}</p>
      </div>

      <div v-if="itemLoading" class="flex items-center gap-2 text-sm text-[var(--muted)]">
        <Loader2 class="h-4 w-4 animate-spin" aria-hidden="true" />
        {{ t("openingMaterial") }}
      </div>

      <div v-if="accessDenied" class="surface-card">
        <p class="font-semibold text-[var(--warning)]">{{ t("memberOnlyTitle") }}</p>
        <p class="mt-2 text-sm leading-6 text-[var(--muted)]">
          {{ t("currentStatus") }}: {{ formatMembershipStatus(session.user?.membershipStatus) }}. {{ t("memberOnlyText") }}
        </p>
      </div>

      <article v-if="selectedItem" class="surface-card">
        <component :is="selectedIcon" class="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
        <div class="mt-3 flex items-start justify-between gap-3">
          <h3 class="text-xl font-semibold text-[var(--text)]">{{ selectedItem.title }}</h3>
          <span v-if="selectedCompletedAt" class="role-badge">
            <CheckCircle2 class="h-4 w-4" aria-hidden="true" />
            {{ t("lessonCompleted") }}
          </span>
        </div>
        <p v-if="selectedItem.summary" class="mt-2 text-sm leading-6 text-[var(--muted-strong)]">{{ selectedItem.summary }}</p>

        <div v-if="selectedItem.body" class="learning-rich-content mt-4" v-html="selectedItem.body"></div>

        <button
          v-if="selectedItem.kind === 'photo' && selectedItem.mediaUrl"
          class="mt-4 w-full"
          type="button"
          @click="openImageViewer(selectedItem.mediaUrl)"
        >
          <img
            class="learning-photo-preview"
            :src="selectedItem.mediaUrl"
            :alt="selectedItem.title"
          />
        </button>

        <video
          v-else-if="selectedItem.kind === 'video' && selectedItem.mediaUrl"
          class="mt-4 aspect-video w-full rounded-xl bg-black"
          :src="selectedItem.mediaUrl"
          controls
          preload="metadata"
          @loadedmetadata="applySavedPlayback"
          @timeupdate="handlePlaybackTimeUpdate"
          @pause="handlePlaybackPause"
          @ended="handlePlaybackEnded"
        />
        <audio
          v-else-if="selectedItem.kind === 'audio' && selectedItem.mediaUrl"
          class="mt-4 w-full"
          :src="selectedItem.mediaUrl"
          controls
          preload="metadata"
          @loadedmetadata="applySavedPlayback"
          @timeupdate="handlePlaybackTimeUpdate"
          @pause="handlePlaybackPause"
          @ended="handlePlaybackEnded"
        />

        <button
          class="primary-button mt-4"
          type="button"
          :disabled="completeLoading || Boolean(selectedCompletedAt)"
          @click="markSelectedComplete"
        >
          {{ selectedCompletedAt ? t("lessonCompleted") : t("markLessonComplete") }}
        </button>

        <button
          v-if="selectedItem.kind === 'video' && selectedItem.mediaUrl"
          class="secondary-button mt-3 w-full"
          type="button"
          @click="openVideoViewer(selectedItem.mediaUrl)"
        >
          Открыть во весь экран
        </button>

        <section class="mt-5 space-y-3">
          <h4 class="font-semibold text-[var(--text)]">{{ t("commentsTitle") }}</h4>
          <form class="grid gap-2" @submit.prevent="handleCreateComment">
            <textarea
              v-model.trim="commentBody"
              class="text-input min-h-24 resize-none"
              :placeholder="t('commentPlaceholder')"
            />
            <button class="secondary-button" type="submit" :disabled="commentSaving">
              {{ t("commentSend") }}
            </button>
          </form>
          <p v-if="!comments.length" class="text-sm text-[var(--muted)]">{{ t("commentsEmpty") }}</p>
          <article v-for="comment in comments" :key="comment.id" class="rounded-xl border border-[var(--border)] p-3">
            <p class="text-sm font-semibold text-[var(--text)]">
              {{ comment.author.firstName || comment.author.username || `ID ${comment.author.telegramId}` }}
            </p>
            <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--muted-strong)]">{{ comment.body }}</p>
          </article>
        </section>
      </article>

      <Teleport to="body">
        <div v-if="imageViewerUrl" class="admin-modal-backdrop" @click.self="closeImageViewer">
          <button class="image-viewer" type="button" aria-label="Закрыть изображение" @click="closeImageViewer">
            <img :src="imageViewerUrl" alt="" />
          </button>
        </div>
      </Teleport>

      <Teleport to="body">
        <div v-if="videoViewerUrl" class="video-viewer" role="dialog" aria-modal="true">
          <video
            class="video-viewer-player"
            :src="videoViewerUrl"
            controls
            autoplay
            playsinline
            @loadedmetadata="applySavedPlayback"
            @timeupdate="handlePlaybackTimeUpdate"
            @pause="handlePlaybackPause"
            @ended="handlePlaybackEnded"
          />
          <button class="video-viewer-close" type="button" aria-label="Закрыть видео" @click="closeVideoViewer">Закрыть</button>
        </div>
      </Teleport>
    </div>
  </section>
</template>
