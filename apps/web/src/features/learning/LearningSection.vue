<script setup lang="ts">
import { computed, ref } from "vue";
import { ExternalLink, Pencil, Plus, X } from "lucide-vue-next";
import { useSessionStore } from "@/stores/session";

type ModuleLesson = {
  title: string;
  url: string;
};

type ModuleCard = {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  images: ModuleLesson[];
};

const initialModuleCards: ModuleCard[] = [
  {
    id: "module-1",
    title: "Модуль 1",
    description: "Первый модуль клуба. Внутри будут уроки и материалы первого блока.",
    createdAt: "26.06.2026",
    images: [
      { title: "Вариант 1. Плеер и очередь", url: "/previews/learning-redesign-1.svg" },
      { title: "Вариант 2. Модули и уроки", url: "/previews/learning-redesign-2.svg" },
      { title: "Вариант 3. Библиотека", url: "/previews/learning-redesign-3.svg" },
      { title: "Вариант 4. Маршрут обучения", url: "/previews/learning-redesign-4.svg" }
    ]
  },
  {
    id: "module-2",
    title: "Модуль 2",
    description: "Второй модуль клуба. Внутри будут уроки следующего блока.",
    createdAt: "26.06.2026",
    images: [
      { title: "Верх экрана", url: "/previews/admin-stats-preview-1.png" },
      { title: "Оплаты и контент", url: "/previews/admin-stats-preview-2.png" },
      { title: "Общение", url: "/previews/admin-stats-preview-3.png" }
    ]
  }
];

const moduleCards = ref<ModuleCard[]>([...initialModuleCards]);
const session = useSessionStore();
const showModuleModal = ref(false);
const moduleEditMode = ref(false);
const editingModuleId = ref<string | null>(null);
const moduleTitle = ref("");
const moduleError = ref("");

const canManageModules = computed(() => session.user?.role === "admin" || session.user?.role === "owner");
const editingModule = computed(() => moduleCards.value.find((module) => module.id === editingModuleId.value) ?? null);
const moduleModalTitle = computed(() => (editingModule.value ? "Редактировать модуль" : "Новый модуль"));
const moduleModalDescription = computed(() => (editingModule.value ? "Измените название выбранного модуля." : "Для модуля нужно только название."));
const trimmedModuleTitle = computed(() => moduleTitle.value.trim());

function lessonCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${count} уроков`;
  }

  if (last === 1) {
    return `${count} урок`;
  }

  if (last >= 2 && last <= 4) {
    return `${count} урока`;
  }

  return `${count} уроков`;
}

function openModuleModal() {
  moduleEditMode.value = false;
  editingModuleId.value = null;
  moduleTitle.value = "";
  moduleError.value = "";
  showModuleModal.value = true;
}

function openModuleEditMode() {
  moduleEditMode.value = true;
  editingModuleId.value = null;
  moduleTitle.value = "";
  moduleError.value = "";
  showModuleModal.value = false;
}

function openModuleEditModal(module: ModuleCard) {
  moduleEditMode.value = false;
  editingModuleId.value = module.id;
  moduleTitle.value = module.title;
  moduleError.value = "";
  showModuleModal.value = true;
}

function closeModuleModal() {
  showModuleModal.value = false;
  editingModuleId.value = null;
  moduleTitle.value = "";
  moduleError.value = "";
}

function saveModule() {
  if (!trimmedModuleTitle.value) {
    moduleError.value = "Введите название модуля.";
    return;
  }

  if (editingModule.value) {
    editingModule.value.title = trimmedModuleTitle.value;
    closeModuleModal();
    return;
  }

  moduleCards.value.push({
    id: `custom-module-${Date.now()}`,
    title: trimmedModuleTitle.value,
    description: "Новый модуль. Уроки можно будет добавить следующим шагом.",
    createdAt: "Сегодня",
    images: []
  });
  closeModuleModal();
}
</script>

<template>
  <section class="admin-panel modules-panel">
    <div class="admin-panel-head">
      <div>
        <h3>Модули</h3>
        <p>Разделы клуба и материалы внутри них.</p>
      </div>
      <div v-if="canManageModules" class="modules-panel-actions" aria-label="Управление модулями">
        <button class="icon-button" type="button" aria-label="Редактировать модуль" @click="openModuleEditMode">
          <Pencil class="h-5 w-5" aria-hidden="true" />
        </button>
        <button class="icon-button" type="button" aria-label="Добавить модуль" @click="openModuleModal">
          <Plus class="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>

    <p v-if="moduleEditMode && canManageModules" class="modules-edit-hint">Выберите модуль для редактирования.</p>

    <div class="admin-mockup-list">
      <article v-for="module in moduleCards" :key="module.id" class="admin-mockup-card" :class="{ 'module-edit-card': moduleEditMode }">
        <div class="admin-mockup-card-head">
          <div>
            <strong>{{ module.title }}</strong>
            <small>Добавлено {{ module.createdAt }}</small>
          </div>
          <span>{{ lessonCountLabel(module.images.length) }}</span>
        </div>
        <p>{{ module.description }}</p>
        <button
          v-if="moduleEditMode && canManageModules"
          class="module-edit-select"
          type="button"
          :aria-label="`Редактировать ${module.title}`"
          @click="openModuleEditModal(module)"
        >
          Выбрать этот модуль
        </button>
        <div class="admin-mockup-grid">
          <a v-for="image in module.images" :key="image.url" class="admin-mockup-thumb" :href="image.url" target="_blank" rel="noreferrer">
            <img :src="image.url" :alt="image.title" loading="lazy" />
            <span>
              {{ image.title }}
              <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </a>
        </div>
      </article>
    </div>

    <div v-if="showModuleModal && canManageModules" class="admin-modal-backdrop" @click.self="closeModuleModal">
      <aside class="admin-detail admin-client-modal module-name-modal" role="dialog" aria-modal="true" aria-labelledby="module-modal-title">
        <header class="admin-client-modal-head">
          <div>
            <h3 id="module-modal-title">{{ moduleModalTitle }}</h3>
            <p>{{ moduleModalDescription }}</p>
          </div>
          <button class="icon-button" type="button" :aria-label="`Закрыть окно: ${moduleModalTitle}`" @click="closeModuleModal">
            <X class="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div class="admin-form module-form">
          <label class="admin-field">
            <span>Название модуля</span>
            <input v-model="moduleTitle" class="text-input" type="text" placeholder="Например: Модуль 3" aria-label="Название модуля" />
          </label>

          <p v-if="moduleError" class="admin-error-text">{{ moduleError }}</p>
        </div>

        <div class="admin-form-actions">
          <button class="secondary-button" type="button" @click="closeModuleModal">Закрыть</button>
          <button class="primary-button" type="button" @click="saveModule">Сохранить модуль</button>
        </div>
      </aside>
    </div>
  </section>
</template>
