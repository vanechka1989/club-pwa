<script setup lang="ts">
import type { LearningContent, LearningCategory } from "@club/shared";
import { CheckCircle2, Image, Loader2, Play, Type } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { completeLearningContent, getLearningContent, getLearningHome } from "@/api/client";
import { useI18n } from "@/features/app/i18n";
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
const loading = ref(false);
const itemLoading = ref(false);
const completeLoading = ref(false);
const error = ref<string | null>(null);
const accessDenied = ref(false);

const selectedIcon = computed(() => {
  if (selectedItem.value?.kind === "photo") {
    return Image;
  }

  if (selectedItem.value?.kind === "video") {
    return Play;
  }

  return Type;
});

const progressPercent = computed(() => {
  if (!totalItems.value) {
    return 0;
  }

  return Math.min(100, Math.round((completedItems.value / totalItems.value) * 100));
});

function iconFor(kind: LearningContent["kind"]) {
  if (kind === "photo") {
    return Image;
  }

  if (kind === "video") {
    return Play;
  }

  return Type;
}

async function loadLearning() {
  loading.value = true;
  error.value = null;

  try {
    const response = await getLearningHome();
    categories.value = response.categories;
    featured.value = response.featured;
    lastOpenedItem.value = response.progress.lastOpenedItem;
    totalItems.value = response.progress.totalItems;
    completedItems.value = response.progress.completedItems;
  } catch {
    error.value = t("learningError");
  } finally {
    loading.value = false;
  }
}

async function openItem(item: LearningContent) {
  selectedItem.value = null;
  selectedCompletedAt.value = null;
  accessDenied.value = false;
  itemLoading.value = true;

  try {
    const response = await getLearningContent(item.id);
    selectedItem.value = response.item;
    selectedCompletedAt.value = response.completedAt;
    lastOpenedItem.value = response.item;
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
</script>

<template>
  <section class="space-y-5">
    <div>
      <p class="section-eyebrow">{{ t("learningEyebrow") }}</p>
      <h2 class="section-title">{{ t("learningTitle") }}</h2>
    </div>

    <div v-if="loading" class="flex items-center gap-2 text-sm text-[var(--muted)]">
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

      <div v-if="categories.length" class="grid gap-3 sm:grid-cols-2">
        <article
          v-for="category in categories"
          :key="category.id"
          class="surface-card"
        >
          <p class="text-sm text-[var(--muted)]">{{ category.itemsCount }} {{ t("materialsCount") }}</p>
          <h3 class="mt-2 font-semibold text-[var(--text)]">{{ category.title }}</h3>
          <p class="mt-1 text-sm leading-6 text-[var(--muted)]">{{ category.description }}</p>
        </article>
      </div>

      <div class="space-y-3">
        <h3 class="font-semibold text-[var(--text)]">{{ t("featured") }}</h3>

        <div v-if="featured.length" class="grid gap-3">
          <button
            v-for="item in featured"
            :key="item.id"
            class="surface-card w-full text-left transition hover:opacity-90"
            type="button"
            @click="openItem(item)"
          >
            <component :is="iconFor(item.kind)" class="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
            <p class="mt-3 font-semibold text-[var(--text)]">{{ item.title }}</p>
            <p class="mt-1 text-sm leading-6 text-[var(--muted)]">{{ item.summary }}</p>
          </button>
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
          {{ t("currentStatus") }}: {{ session.user?.membershipStatus ?? "inactive" }}. {{ t("memberOnlyText") }}
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
        <p v-if="selectedItem.summary" class="mt-2 text-sm leading-6 text-[var(--muted)]">{{ selectedItem.summary }}</p>

        <div v-if="selectedItem.kind === 'text'" class="prose prose-invert mt-4 max-w-none">
          <p>{{ selectedItem.body }}</p>
        </div>

        <img
          v-else-if="selectedItem.kind === 'photo' && selectedItem.mediaUrl"
          class="mt-4 aspect-video w-full object-cover"
          :src="selectedItem.mediaUrl"
          :alt="selectedItem.title"
        />

        <video
          v-else-if="selectedItem.kind === 'video' && selectedItem.mediaUrl"
          class="mt-4 aspect-video w-full bg-black"
          :src="selectedItem.mediaUrl"
          controls
        />

        <button
          class="primary-button mt-4"
          type="button"
          :disabled="completeLoading || Boolean(selectedCompletedAt)"
          @click="markSelectedComplete"
        >
          {{ selectedCompletedAt ? t("lessonCompleted") : t("markLessonComplete") }}
        </button>
      </article>
    </div>
  </section>
</template>
