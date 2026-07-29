<script setup lang="ts">
import type { ClubTopic, CommunityMessageSearchCursor, CommunityMessageSearchResult } from "@club/shared";
import { ArrowLeft, Search, X } from "lucide-vue-next";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { searchCommunityMessages } from "@/api/client";
import { communityErrorStatus } from "./communityViewModel";

const props = withDefaults(defineProps<{
  topics: ClubTopic[];
  initialTopicId?: string | null;
  openResult: (result: CommunityMessageSearchResult) => Promise<void>;
}>(), {
  initialTopicId: null
});

const emit = defineEmits<{ close: [] }>();
const query = ref("");
const topicId = ref(props.initialTopicId ?? "");
const results = ref<CommunityMessageSearchResult[]>([]);
const nextCursor = ref<CommunityMessageSearchCursor | null>(null);
const loading = ref(false);
const openingMessageId = ref<string | null>(null);
const statusMessage = ref("");
const searchInput = ref<HTMLInputElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
let debounceTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let requestGeneration = 0;
let disposed = false;

function clearDebounce() {
  if (!debounceTimer) return;
  globalThis.clearTimeout(debounceTimer);
  debounceTimer = null;
}

async function runSearch(before?: CommunityMessageSearchCursor) {
  const normalizedQuery = query.value.trim();
  if (normalizedQuery.length < 2) {
    requestGeneration += 1;
    results.value = [];
    nextCursor.value = null;
    loading.value = false;
    statusMessage.value = normalizedQuery ? "Введите не меньше двух символов." : "";
    return;
  }

  const generation = ++requestGeneration;
  loading.value = true;
  statusMessage.value = "";
  try {
    const response = await searchCommunityMessages({
      q: normalizedQuery,
      ...(topicId.value ? { topicId: topicId.value } : {}),
      ...(before ? { before } : {}),
      limit: 20
    });
    if (disposed || generation !== requestGeneration) return;
    results.value = before ? [...results.value, ...response.results] : response.results;
    nextCursor.value = response.nextCursor;
    if (!results.value.length) statusMessage.value = "Ничего не найдено.";
  } catch {
    if (disposed || generation !== requestGeneration) return;
    statusMessage.value = "Не удалось выполнить поиск. Попробуйте ещё раз.";
  } finally {
    if (!disposed && generation === requestGeneration) loading.value = false;
  }
}

function scheduleSearch() {
  clearDebounce();
  requestGeneration += 1;
  debounceTimer = globalThis.setTimeout(() => {
    debounceTimer = null;
    void runSearch();
  }, 300);
}

function keepFocusInside(event: KeyboardEvent) {
  if (event.key !== "Tab") return;
  const focusable = [...(dialog.value?.querySelectorAll<HTMLElement>(
    "button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])"
  ) ?? [])].filter((element) => !element.hidden && element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function selectResult(result: CommunityMessageSearchResult) {
  if (openingMessageId.value) return;
  openingMessageId.value = result.messageId;
  statusMessage.value = "";
  try {
    await props.openResult(result);
    if (!disposed) emit("close");
  } catch (reason) {
    if (disposed) return;
    if (communityErrorStatus(reason) === 404) {
      results.value = results.value.filter((item) => item.messageId !== result.messageId);
      statusMessage.value = "Сообщение больше недоступно. Результат удалён из списка.";
    } else {
      statusMessage.value = "Не удалось открыть сообщение. Попробуйте ещё раз.";
    }
  } finally {
    if (!disposed && openingMessageId.value === result.messageId) openingMessageId.value = null;
  }
}

watch([query, topicId], scheduleSearch);

onMounted(() => {
  void nextTick(() => searchInput.value?.focus());
});

onBeforeUnmount(() => {
  disposed = true;
  requestGeneration += 1;
  clearDebounce();
});
</script>

<template>
  <section
    ref="dialog"
    class="chat-search-layer task-screen-route-layer"
    role="dialog"
    aria-modal="true"
    aria-label="Поиск сообщений"
    @keydown="keepFocusInside"
    @keydown.esc="$emit('close')"
  >
    <div class="chat-search-task task-screen">
    <header class="chat-search-header">
      <button class="icon-button ui-icon-button" type="button" aria-label="Закрыть поиск" @click="$emit('close')">
        <ArrowLeft class="h-4 w-4" aria-hidden="true" />
      </button>
      <div class="chat-search-field">
        <Search class="h-4 w-4" aria-hidden="true" />
        <input
          ref="searchInput"
          v-model="query"
          type="search"
          inputmode="search"
          aria-label="Поиск сообщений"
          autocomplete="off"
          placeholder="Поиск сообщений"
        />
        <button v-if="query" type="button" aria-label="Очистить поиск" @click="query = ''">
          <X class="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div class="chat-search-content task-screen-body">
      <label class="chat-search-topic-filter">
        <span>Искать в теме</span>
        <select v-model="topicId">
          <option value="">Во всех темах</option>
          <option v-for="topic in topics" :key="topic.id" :value="topic.id">{{ topic.title }}</option>
        </select>
      </label>

      <div class="chat-search-results" :aria-busy="loading">
      <p v-if="loading && !results.length" class="chat-search-state">Ищем…</p>
      <button
        v-for="result in results"
        :key="result.messageId"
        class="chat-search-result"
        type="button"
        :disabled="Boolean(openingMessageId)"
        :aria-label="`${result.excerpt}, тема ${result.topicTitle}`"
        @click="selectResult(result)"
      >
        <span class="chat-search-result-head">
          <strong>{{ result.topicTitle }}</strong>
          <time :datetime="result.createdAt">{{ new Date(result.createdAt).toLocaleDateString("ru-RU") }}</time>
        </span>
        <span class="chat-search-result-author">{{ result.author.displayName || result.author.firstName || result.author.username }}</span>
        <span class="chat-search-result-excerpt">{{ result.excerpt }}</span>
      </button>
      <button
        v-if="nextCursor"
        class="mini-action chat-search-more"
        type="button"
        :disabled="loading"
        @click="runSearch(nextCursor)"
      >
        {{ loading ? "Загрузка…" : "Показать ещё" }}
      </button>
      <p v-if="statusMessage" class="chat-search-state" role="status" aria-live="polite">{{ statusMessage }}</p>
      </div>
    </div>
    </div>
  </section>
</template>
