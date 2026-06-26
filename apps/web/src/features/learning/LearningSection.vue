<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { AdminLearningMaterial, ContentCardLayout, ContentKind, LearningCategory, LearningContent } from "@club/shared";
import { ChevronDown, ExternalLink, Mic, Pencil, Plus, Square, Trash2, X } from "lucide-vue-next";
import {
  createAdminLearningCategory,
  createAdminLearningMaterial,
  deleteAdminLearningMaterial,
  getAdminLearning,
  getLearningHome,
  restoreAdminLearningMaterial,
  updateAdminLearningCategory,
  updateAdminLearningMaterial
} from "@/api/client";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type ColorScheme } from "@/stores/ui";
import { getMaterialDraftError } from "./materialForm";
import { createVoiceUpload, type NamedBlobUpload } from "./voiceUpload";

type ModuleLesson = {
  id: string;
  categoryId: string;
  kind: ContentKind;
  title: string;
  url: string;
  description: string;
  content: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  cardLayout: ContentCardLayout;
  isPersisted: boolean;
};

type ModuleCard = {
  id: string;
  title: string;
  description: string;
  meta: string;
  isPersisted: boolean;
  images: ModuleLesson[];
};

const deletedContentModuleId = "deleted-content-module";

const initialModuleCards: ModuleCard[] = [
  {
    id: "module-1",
    title: "Модуль 1",
    description: "Первый модуль клуба. Внутри будут уроки и материалы первого блока.",
    images: [
      {
        id: "module-1-lesson-1",
        categoryId: "module-1",
        kind: "text",
        title: "Вариант 1. Плеер и очередь",
        url: "/previews/learning-redesign-1.svg",
        description: "Плеер, очередь просмотра и быстрый возврат к уроку.",
        content: "Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.",
        mediaUrl: null,
        thumbnailUrl: "/previews/learning-redesign-1.svg",
        cardLayout: "vertical",
        isPersisted: false
      },
      {
        id: "module-1-lesson-2",
        categoryId: "module-1",
        kind: "text",
        title: "Вариант 2. Модули и уроки",
        url: "/previews/learning-redesign-2.svg",
        description: "Модульная структура с уроками внутри каждого блока.",
        content: "Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.",
        mediaUrl: null,
        thumbnailUrl: "/previews/learning-redesign-2.svg",
        cardLayout: "horizontal",
        isPersisted: false
      },
      {
        id: "module-1-lesson-3",
        categoryId: "module-1",
        kind: "text",
        title: "Вариант 3. Библиотека",
        url: "/previews/learning-redesign-3.svg",
        description: "Библиотечный вид для быстрого поиска нужного урока.",
        content: "Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.",
        mediaUrl: null,
        thumbnailUrl: "/previews/learning-redesign-3.svg",
        cardLayout: "vertical",
        isPersisted: false
      },
      {
        id: "module-1-lesson-4",
        categoryId: "module-1",
        kind: "text",
        title: "Вариант 4. Маршрут обучения",
        url: "/previews/learning-redesign-4.svg",
        description: "Маршрут прохождения с понятными шагами.",
        content: "Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.",
        mediaUrl: null,
        thumbnailUrl: "/previews/learning-redesign-4.svg",
        cardLayout: "vertical",
        isPersisted: false
      }
    ],
    meta: "Модуль клуба",
    isPersisted: false
  },
  {
    id: "module-2",
    title: "Модуль 2",
    description: "Второй модуль клуба. Внутри будут уроки следующего блока.",
    images: [
      {
        id: "module-2-lesson-1",
        categoryId: "module-2",
        kind: "text",
        title: "Верх экрана",
        url: "/previews/admin-stats-preview-1.png",
        description: "Первый экран урока.",
        content: "Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.",
        mediaUrl: null,
        thumbnailUrl: "/previews/admin-stats-preview-1.png",
        cardLayout: "vertical",
        isPersisted: false
      },
      {
        id: "module-2-lesson-2",
        categoryId: "module-2",
        kind: "text",
        title: "Оплаты и контент",
        url: "/previews/admin-stats-preview-2.png",
        description: "Экран с данными по оплатам и контенту.",
        content: "Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.",
        mediaUrl: null,
        thumbnailUrl: "/previews/admin-stats-preview-2.png",
        cardLayout: "vertical",
        isPersisted: false
      },
      {
        id: "module-2-lesson-3",
        categoryId: "module-2",
        kind: "text",
        title: "Общение",
        url: "/previews/admin-stats-preview-3.png",
        description: "Экран с данными по общению.",
        content: "Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.",
        mediaUrl: null,
        thumbnailUrl: "/previews/admin-stats-preview-3.png",
        cardLayout: "vertical",
        isPersisted: false
      }
    ],
    meta: "Модуль клуба",
    isPersisted: false
  }
];

const moduleCards = ref<ModuleCard[]>(initialModuleCards.map((module) => ({ ...module, images: module.images.map((lesson) => ({ ...lesson })) })));
const deletedLessons = ref<ModuleLesson[]>([]);
const session = useSessionStore();
const ui = useUiStore();
const modulesLoadedFromApi = ref(false);
const isLoadingModules = ref(false);
const isSaving = ref(false);
const showModuleModal = ref(false);
const editingModuleId = ref<string | null>(null);
const collapsedModuleIds = ref<string[]>(initialModuleCards.map((module) => module.id));
const moduleTitle = ref("");
const moduleError = ref("");
const selectedLesson = ref<{ moduleId: string; lessonId: string | null } | null>(null);
const lessonTitle = ref("");
const lessonDescription = ref("");
const lessonKind = ref<ContentKind>("text");
const lessonFile = ref<File | NamedBlobUpload | null>(null);
const lessonFileName = ref("");
const lessonThumbnailFile = ref<File | null>(null);
const lessonThumbnailFileName = ref("");
const shouldRemoveLessonThumbnail = ref(false);
const lessonCardLayout = ref<ContentCardLayout>("vertical");
const lessonContent = ref("");
const lessonError = ref("");
const isVoiceRecording = ref(false);
const voiceRecorder = ref<MediaRecorder | null>(null);
const voiceStream = ref<MediaStream | null>(null);
let voiceChunks: Blob[] = [];

const canManageModules = computed(() => session.user?.role === "admin" || session.user?.role === "owner");
const editingModule = computed(() => moduleCards.value.find((module) => module.id === editingModuleId.value) ?? null);
const moduleModalTitle = computed(() => (editingModule.value ? "Редактировать модуль" : "Новый модуль"));
const moduleModalDescription = computed(() => (editingModule.value ? "Измените название выбранного модуля." : "Для модуля нужно только название."));
const trimmedModuleTitle = computed(() => moduleTitle.value.trim());
const selectedLessonModule = computed(() => moduleCards.value.find((module) => module.id === selectedLesson.value?.moduleId) ?? null);
const selectedLessonItem = computed(() => selectedLessonModule.value?.images.find((lesson) => lesson.id === selectedLesson.value?.lessonId) ?? null);
const lessonModalTitle = computed(() => (selectedLessonItem.value ? selectedLessonItem.value.title : "Новый урок"));
const lessonModalSubtitle = computed(() => selectedLessonModule.value?.title ?? "Модуль");
const trimmedLessonTitle = computed(() => lessonTitle.value.trim());
const lessonPreviewSource = computed(() => {
  if (selectedLessonItem.value) {
    return getLessonImage(selectedLessonItem.value);
  }

  return getDefaultLessonCover(ui.colorScheme, lessonCardLayout.value);
});

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
  editingModuleId.value = null;
  moduleTitle.value = "";
  moduleError.value = "";
  showModuleModal.value = true;
}

function openModuleEditModal(module: ModuleCard) {
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

function isModuleCollapsed(moduleId: string) {
  return collapsedModuleIds.value.includes(moduleId);
}

function toggleModule(moduleId: string) {
  collapsedModuleIds.value = isModuleCollapsed(moduleId)
    ? collapsedModuleIds.value.filter((id) => id !== moduleId)
    : [...collapsedModuleIds.value, moduleId];
}

function collapseAllModules() {
  collapsedModuleIds.value = [
    ...moduleCards.value.map((module) => module.id),
    ...(deletedLessons.value.length ? [deletedContentModuleId] : [])
  ];
}

function collapseModule(moduleId: string) {
  if (!collapsedModuleIds.value.includes(moduleId)) {
    collapsedModuleIds.value = [...collapsedModuleIds.value, moduleId];
  }
}

function openLessonModal(module: ModuleCard, lesson: ModuleLesson) {
  selectedLesson.value = { moduleId: module.id, lessonId: lesson.id };
  lessonTitle.value = lesson.title;
  lessonDescription.value = lesson.description;
  lessonKind.value = lesson.kind;
  lessonFile.value = null;
  lessonFileName.value = lesson.mediaUrl ? "Текущий файл сохранён" : "";
  lessonThumbnailFile.value = null;
  lessonThumbnailFileName.value = lesson.thumbnailUrl ? "Текущая обложка сохранена" : "";
  shouldRemoveLessonThumbnail.value = false;
  lessonCardLayout.value = lesson.cardLayout;
  lessonContent.value = lesson.content;
  lessonError.value = "";
}

function openLessonCreateModal(module: ModuleCard) {
  if (!canManageModules.value) {
    return;
  }

  selectedLesson.value = { moduleId: module.id, lessonId: null };
  lessonTitle.value = "";
  lessonDescription.value = "";
  lessonKind.value = "text";
  lessonFile.value = null;
  lessonFileName.value = "";
  lessonThumbnailFile.value = null;
  lessonThumbnailFileName.value = "";
  shouldRemoveLessonThumbnail.value = false;
  lessonCardLayout.value = "vertical";
  lessonContent.value = "";
  lessonError.value = "";
}

function closeLessonModal() {
  selectedLesson.value = null;
  lessonTitle.value = "";
  lessonDescription.value = "";
  lessonKind.value = "text";
  lessonFile.value = null;
  lessonFileName.value = "";
  lessonThumbnailFile.value = null;
  lessonThumbnailFileName.value = "";
  shouldRemoveLessonThumbnail.value = false;
  lessonCardLayout.value = "vertical";
  lessonContent.value = "";
  lessonError.value = "";
}

function cloneInitialModules() {
  return initialModuleCards.map((module) => ({ ...module, images: module.images.map((lesson) => ({ ...lesson })) }));
}

function materialPreviewUrl(item: AdminLearningMaterial | LearningContent) {
  return item.thumbnailUrl || getDefaultLessonCover(ui.colorScheme, item.cardLayout);
}

function getDefaultLessonCover(colorScheme: ColorScheme, cardLayout: ContentCardLayout) {
  return `/previews/default-lessons/${colorScheme}-${cardLayout}.webp`;
}

function getLessonImage(item: ModuleLesson) {
  return item.thumbnailUrl || getDefaultLessonCover(ui.colorScheme, item.cardLayout);
}

function materialToLesson(item: AdminLearningMaterial | LearningContent): ModuleLesson {
  return {
    id: item.id,
    categoryId: item.categoryId,
    kind: item.kind,
    title: item.title,
    url: materialPreviewUrl(item),
    description: item.summary ?? "",
    content: item.body ?? "",
    mediaUrl: item.mediaUrl,
    thumbnailUrl: item.thumbnailUrl,
    cardLayout: item.cardLayout,
    isPersisted: true
  };
}

function categoriesToModules(
  categories: LearningCategory[],
  materials: Array<AdminLearningMaterial | LearningContent>,
  meta = "Модуль клуба"
) {
  return categories.map((category) => ({
    id: category.id,
    title: category.title,
    description: category.description ?? "Модуль клуба. Внутри будут уроки и материалы.",
    meta,
    isPersisted: true,
    images: materials.filter((material) => material.categoryId === category.id).map(materialToLesson)
  }));
}

async function loadModules() {
  isLoadingModules.value = true;

  try {
    if (canManageModules.value) {
      const response = await getAdminLearning();
      const modules = categoriesToModules(response.categories, response.materials);
      moduleCards.value = modules.length ? modules : cloneInitialModules();
      deletedLessons.value = response.deletedMaterials.map(materialToLesson);
    } else {
      const response = await getLearningHome();
      const modules = categoriesToModules(response.categories, response.featured);
      moduleCards.value = modules.length ? modules : cloneInitialModules();
      deletedLessons.value = [];
    }
    modulesLoadedFromApi.value = true;
    collapseAllModules();
  } catch {
    moduleCards.value = moduleCards.value.length ? moduleCards.value : cloneInitialModules();
    deletedLessons.value = [];
    modulesLoadedFromApi.value = false;
    collapseAllModules();
  } finally {
    isLoadingModules.value = false;
  }
}

function updateModuleInList(category: LearningCategory) {
  moduleCards.value = moduleCards.value.map((module) =>
    module.id === category.id
      ? {
          ...module,
          title: category.title,
          description: category.description ?? module.description
        }
      : module
  );
}

function addMaterialToModule(material: AdminLearningMaterial) {
  moduleCards.value = moduleCards.value.map((module) =>
    module.id === material.categoryId ? { ...module, images: [...module.images, materialToLesson(material)] } : module
  );
}

function replaceMaterialInModule(material: AdminLearningMaterial) {
  moduleCards.value = moduleCards.value.map((module) => ({
    ...module,
    images: module.images.map((lesson) => (lesson.id === material.id ? materialToLesson(material) : lesson))
  }));
}

function removeLessonFromModule(moduleId: string, lessonId: string) {
  moduleCards.value = moduleCards.value.map((module) =>
    module.id === moduleId ? { ...module, images: module.images.filter((lesson) => lesson.id !== lessonId) } : module
  );
}

function appendFile(form: FormData, key: string, file: File | NamedBlobUpload | null) {
  if (!file) {
    return;
  }

  if (file instanceof File) {
    form.set(key, file);
    return;
  }

  form.set(key, file.blob, file.name);
}

function buildLessonForm() {
  const form = new FormData();
  form.set("categoryId", selectedLessonModule.value?.id ?? "");
  form.set("kind", lessonKind.value);
  form.set("title", trimmedLessonTitle.value);
  form.set("summary", lessonDescription.value.trim());
  form.set("body", lessonContent.value.trim());
  form.set("cardLayout", lessonCardLayout.value);
  form.set("isPublished", "true");
  appendFile(form, "file", lessonFile.value);
  if (lessonThumbnailFile.value) {
    form.set("thumbnailFile", lessonThumbnailFile.value);
  }
  if (shouldRemoveLessonThumbnail.value) {
    form.set("removeThumbnail", "true");
  }

  return form;
}

async function saveModule() {
  if (!trimmedModuleTitle.value) {
    moduleError.value = "Введите название модуля.";
    return;
  }

  if (!modulesLoadedFromApi.value) {
    if (editingModule.value) {
      editingModule.value.title = trimmedModuleTitle.value;
      closeModuleModal();
      return;
    }

    const moduleId = `custom-module-${Date.now()}`;
    moduleCards.value.push({
      id: moduleId,
      title: trimmedModuleTitle.value,
      description: "Новый модуль. Уроки можно будет добавить следующим шагом.",
      meta: "Добавлено сегодня",
      isPersisted: false,
      images: []
    });
    collapseModule(moduleId);
    closeModuleModal();
    return;
  }

  isSaving.value = true;
  moduleError.value = "";

  try {
    if (editingModule.value) {
      const response = await updateAdminLearningCategory(editingModule.value.id, {
        title: trimmedModuleTitle.value,
        description: editingModule.value.description
      });
      updateModuleInList(response.category);
      closeModuleModal();
      return;
    }

    const response = await createAdminLearningCategory({
      title: trimmedModuleTitle.value,
      description: "Новый модуль. Уроки можно будет добавить следующим шагом."
    });
    moduleCards.value = [
      ...moduleCards.value,
      {
        id: response.category.id,
        title: response.category.title,
        description: response.category.description ?? "Новый модуль. Уроки можно будет добавить следующим шагом.",
        meta: "Добавлено сегодня",
        isPersisted: true,
        images: []
      }
    ];
    collapseModule(response.category.id);
    closeModuleModal();
  } catch {
    moduleError.value = "Не удалось сохранить модуль.";
  } finally {
    isSaving.value = false;
  }
}

function saveLessonLocally() {
  if (editingModule.value) {
    return;
  }

  const lessonData: ModuleLesson = {
    id: selectedLessonItem.value?.id ?? `custom-lesson-${Date.now()}`,
    categoryId: selectedLessonModule.value?.id ?? "",
    kind: lessonKind.value,
    title: trimmedLessonTitle.value,
    url: lessonPreviewSource.value,
    description: lessonDescription.value.trim(),
    content: lessonContent.value.trim() || "Здесь будет содержимое урока: текст, фото, видео, аудио или голосовое сообщение.",
    mediaUrl: null,
    thumbnailUrl: shouldRemoveLessonThumbnail.value ? null : (selectedLessonItem.value?.thumbnailUrl ?? null),
    cardLayout: lessonCardLayout.value,
    isPersisted: false
  };

  if (selectedLessonItem.value) {
    Object.assign(selectedLessonItem.value, lessonData);
    return;
  }

  selectedLessonModule.value?.images.push(lessonData);
}

async function saveLesson() {
  if (!selectedLessonModule.value) {
    lessonError.value = "Модуль не найден.";
    return;
  }

  if (!trimmedLessonTitle.value) {
    lessonError.value = "Введите название урока.";
    return;
  }

  const draftError = getMaterialDraftError({
    title: lessonTitle.value,
    kind: lessonKind.value,
    isEditing: Boolean(selectedLessonItem.value?.isPersisted),
    currentKind: selectedLessonItem.value?.kind ?? null,
    currentMediaUrl: selectedLessonItem.value?.mediaUrl ?? null,
    hasMediaFile: Boolean(lessonFile.value),
    isVoiceRecording: isVoiceRecording.value,
    isVoiceProcessing: false
  });

  if (draftError) {
    lessonError.value = draftError;
    return;
  }

  if (!modulesLoadedFromApi.value) {
    saveLessonLocally();
    closeLessonModal();
    return;
  }

  isSaving.value = true;
  lessonError.value = "";

  try {
    if (selectedLessonItem.value?.isPersisted) {
      const response = await updateAdminLearningMaterial(selectedLessonItem.value.id, buildLessonForm());
      replaceMaterialInModule(response.material);
      closeLessonModal();
      return;
    }

    const response = await createAdminLearningMaterial(buildLessonForm());
    addMaterialToModule(response.material);
    closeLessonModal();
  } catch {
    lessonError.value = "Не удалось сохранить урок. Проверьте файл и настройки S3.";
  } finally {
    isSaving.value = false;
  }
}

async function deleteLesson() {
  if (!selectedLessonModule.value || !selectedLessonItem.value || !canManageModules.value) {
    return;
  }

  const lesson = selectedLessonItem.value;
  const moduleId = selectedLessonModule.value.id;
  const confirmed = window.confirm(`Удалить урок "${lesson.title}"? Он попадет в удалённые на 7 дней.`);
  if (!confirmed) {
    return;
  }

  isSaving.value = true;
  lessonError.value = "";

  try {
    if (lesson.isPersisted && modulesLoadedFromApi.value) {
      await deleteAdminLearningMaterial(lesson.id);
    }

    removeLessonFromModule(moduleId, lesson.id);
    deletedLessons.value = [
      {
        ...lesson,
        categoryId: moduleId
      },
      ...deletedLessons.value.filter((item) => item.id !== lesson.id)
    ];
    collapseModule(deletedContentModuleId);
    closeLessonModal();
  } catch {
    lessonError.value = "Не удалось удалить урок.";
  } finally {
    isSaving.value = false;
  }
}

function handleLessonFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  lessonFile.value = file;
  lessonFileName.value = file?.name ?? "";
}

function handleLessonThumbnailChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  lessonThumbnailFile.value = file;
  lessonThumbnailFileName.value = file?.name ?? "";
  if (file) {
    shouldRemoveLessonThumbnail.value = false;
  }
}

function removeLessonThumbnail() {
  lessonThumbnailFile.value = null;
  lessonThumbnailFileName.value = selectedLessonItem.value?.thumbnailUrl ? "Обложка будет удалена" : "";
  shouldRemoveLessonThumbnail.value = Boolean(selectedLessonItem.value?.thumbnailUrl);
}

async function restoreDeletedLesson(lesson: ModuleLesson) {
  if (!canManageModules.value) {
    return;
  }

  isSaving.value = true;

  try {
    if (lesson.isPersisted && modulesLoadedFromApi.value) {
      const response = await restoreAdminLearningMaterial(lesson.id);
      addMaterialToModule(response.material);
    } else {
      const module = moduleCards.value.find((item) => item.id === lesson.categoryId) ?? moduleCards.value[0];
      if (module) {
        module.images.push({ ...lesson });
      }
    }
    deletedLessons.value = deletedLessons.value.filter((item) => item.id !== lesson.id);
  } finally {
    isSaving.value = false;
  }
}

async function startVoiceRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    lessonError.value = "Запись голоса недоступна в этом браузере.";
    return;
  }

  try {
    voiceChunks = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const options = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? { mimeType: "audio/webm;codecs=opus" }
      : undefined;
    const recorder = new MediaRecorder(stream, options);

    voiceStream.value = stream;
    voiceRecorder.value = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        voiceChunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      const upload = createVoiceUpload(voiceChunks, recorder.mimeType);
      lessonKind.value = "audio";
      lessonFile.value = upload;
      lessonFileName.value = upload.name;
      isVoiceRecording.value = false;
      stream.getTracks().forEach((track) => track.stop());
      voiceStream.value = null;
      voiceRecorder.value = null;
    };
    recorder.start();
    isVoiceRecording.value = true;
    lessonError.value = "";
  } catch {
    lessonError.value = "Не удалось начать запись голоса.";
  }
}

function stopVoiceRecording() {
  if (voiceRecorder.value && voiceRecorder.value.state !== "inactive") {
    voiceRecorder.value.stop();
  }
}

onMounted(() => {
  void loadModules();
});

watch(
  () => canManageModules.value,
  () => {
    void loadModules();
  }
);
</script>

<template>
  <section class="admin-panel modules-panel">
    <div class="admin-panel-head">
      <div>
        <h3>Модули</h3>
        <p>Разделы клуба и материалы внутри них.</p>
      </div>
      <div v-if="canManageModules" class="modules-panel-actions" aria-label="Управление модулями">
        <button class="icon-button" type="button" aria-label="Добавить модуль" @click="openModuleModal">
          <Plus class="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>

    <p v-if="isLoadingModules" class="modules-edit-hint">Загружаем модули...</p>

    <div class="admin-mockup-list">
      <article v-for="module in moduleCards" :key="module.id" class="admin-mockup-card" :class="{ 'module-card-collapsed': isModuleCollapsed(module.id) }">
        <div class="admin-mockup-card-head module-card-head">
          <button
            class="module-card-toggle"
            type="button"
            :aria-label="`${isModuleCollapsed(module.id) ? 'Развернуть' : 'Свернуть'} ${module.title}`"
            :aria-expanded="!isModuleCollapsed(module.id)"
            @click="toggleModule(module.id)"
          >
            <span>
              <strong>{{ module.title }}</strong>
              <small>{{ module.meta }}</small>
            </span>
          </button>
          <div class="admin-mockup-card-actions">
            <span>{{ lessonCountLabel(module.images.length) }}</span>
            <button
              v-if="canManageModules"
              class="icon-button module-lesson-add"
              type="button"
              :aria-label="`Редактировать ${module.title}`"
              @click="openModuleEditModal(module)"
            >
              <Pencil class="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              v-if="canManageModules && !isModuleCollapsed(module.id)"
              class="icon-button module-lesson-add"
              type="button"
              :aria-label="`Добавить урок в ${module.title}`"
              @click="openLessonCreateModal(module)"
            >
              <Plus class="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              class="icon-button module-lesson-add module-collapse-control"
              type="button"
              :aria-label="`Переключить ${module.title}`"
              @click="toggleModule(module.id)"
            >
              <ChevronDown class="h-4 w-4" :class="{ 'module-chevron-collapsed': isModuleCollapsed(module.id) }" aria-hidden="true" />
            </button>
          </div>
        </div>
        <p v-if="!isModuleCollapsed(module.id)">{{ module.description }}</p>
        <div v-if="!isModuleCollapsed(module.id)" class="admin-mockup-grid">
          <button
            v-for="image in module.images"
            :key="image.id"
            class="admin-mockup-thumb"
            :class="image.cardLayout === 'horizontal' ? 'admin-mockup-thumb-horizontal' : 'admin-mockup-thumb-vertical'"
            type="button"
            :aria-label="`Открыть урок ${image.title}`"
            @click="openLessonModal(module, image)"
          >
            <img :src="getLessonImage(image)" :alt="image.title" loading="lazy" />
            <span>
              {{ image.title }}
              <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </button>
        </div>
      </article>

      <article
        v-if="canManageModules && deletedLessons.length"
        class="admin-mockup-card admin-mockup-deleted-module"
        :class="{ 'module-card-collapsed': isModuleCollapsed(deletedContentModuleId) }"
      >
        <div class="admin-mockup-card-head module-card-head">
          <button
            class="module-card-toggle"
            type="button"
            :aria-label="`${isModuleCollapsed(deletedContentModuleId) ? 'Развернуть' : 'Свернуть'} Удалённый контент`"
            :aria-expanded="!isModuleCollapsed(deletedContentModuleId)"
            @click="toggleModule(deletedContentModuleId)"
          >
            <span>
              <strong>Удалённый контент</strong>
              <small>Системный модуль</small>
            </span>
          </button>
          <div class="admin-mockup-card-actions">
            <span>{{ lessonCountLabel(deletedLessons.length) }}</span>
            <button
              class="icon-button module-lesson-add module-collapse-control"
              type="button"
              aria-label="Переключить Удалённый контент"
              @click="toggleModule(deletedContentModuleId)"
            >
              <ChevronDown class="h-4 w-4" :class="{ 'module-chevron-collapsed': isModuleCollapsed(deletedContentModuleId) }" aria-hidden="true" />
            </button>
          </div>
        </div>
        <p v-if="!isModuleCollapsed(deletedContentModuleId)">Хранится 7 дней после удаления. Можно восстановить прямо из карточки.</p>
        <div v-if="!isModuleCollapsed(deletedContentModuleId)" class="deleted-lessons-list">
          <article v-for="lesson in deletedLessons" :key="lesson.id" class="deleted-lesson-card">
            <div class="deleted-lesson-preview">
              <img :src="getLessonImage(lesson)" :alt="lesson.title" loading="lazy" />
              <div>
                <span>Удалено</span>
                <strong>{{ lesson.title }}</strong>
                <small>{{ lesson.description || "Описание урока не заполнено." }}</small>
              </div>
            </div>
            <button class="restore-lesson-button" type="button" :disabled="isSaving" :aria-label="`Восстановить ${lesson.title}`" @click="restoreDeletedLesson(lesson)">
              Восстановить
            </button>
          </article>
        </div>
      </article>
    </div>

    <div v-if="showModuleModal && canManageModules" class="admin-modal-backdrop" @click.self="closeModuleModal">
      <aside class="module-name-modal" role="dialog" aria-modal="true" aria-labelledby="module-modal-title">
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
          <button class="secondary-button" type="button" :disabled="isSaving" @click="closeModuleModal">Закрыть</button>
          <button class="primary-button" type="button" :disabled="isSaving" @click="saveModule">
            {{ isSaving ? "Сохраняем..." : "Сохранить модуль" }}
          </button>
        </div>
      </aside>
    </div>

    <Teleport to="body">
      <div v-if="selectedLesson && selectedLessonModule" class="admin-modal-backdrop lesson-preview-backdrop" @click.self="closeLessonModal">
        <aside
          class="lesson-preview-modal"
          :class="canManageModules ? 'lesson-preview-modal-edit' : 'lesson-preview-modal-view'"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lesson-preview-title"
        >
          <header class="admin-client-modal-head">
            <div>
              <span class="lesson-preview-kicker">Урок из модуля</span>
              <h3 id="lesson-preview-title">{{ lessonModalTitle }}</h3>
              <p>{{ lessonModalSubtitle }}</p>
            </div>
            <button class="icon-button" type="button" :aria-label="`Закрыть урок: ${lessonModalTitle}`" @click="closeLessonModal">
              <X class="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <div class="lesson-preview-scroll">
            <div class="lesson-preview-body">
              <img :src="lessonPreviewSource" :alt="lessonModalTitle" loading="lazy" />
              <div class="lesson-preview-copy">
                <strong>{{ lessonTitle || lessonModalTitle }}</strong>
                <span>{{ lessonDescription || "Описание урока пока не заполнено." }}</span>
              </div>
            </div>

            <div v-if="canManageModules" class="admin-form lesson-editor-form">
              <div class="admin-field">
                <span>Вид карточки</span>
                <div class="lesson-layout-toggle" role="group" aria-label="Вид карточки урока">
                  <button
                    class="lesson-layout-option"
                    :class="{ 'lesson-layout-option-active': lessonCardLayout === 'vertical' }"
                    type="button"
                    aria-label="Вертикальная карточка"
                    @click="lessonCardLayout = 'vertical'"
                  >
                    Вертикальная
                  </button>
                  <button
                    class="lesson-layout-option"
                    :class="{ 'lesson-layout-option-active': lessonCardLayout === 'horizontal' }"
                    type="button"
                    aria-label="Горизонтальная карточка"
                    @click="lessonCardLayout = 'horizontal'"
                  >
                    Горизонтальная
                  </button>
                </div>
              </div>
              <label class="admin-field">
                <span>Название урока</span>
                <input v-model="lessonTitle" class="text-input" type="text" placeholder="Например: Первый урок" aria-label="Название урока" />
              </label>
              <label class="admin-field">
                <span>Описание урока</span>
                <input v-model="lessonDescription" class="text-input" type="text" placeholder="Короткое описание" aria-label="Описание урока" />
              </label>
              <label class="admin-field">
                <span>Тип урока</span>
                <select v-model="lessonKind" class="text-input" aria-label="Тип урока">
                  <option value="text">Текст</option>
                  <option value="photo">Фото</option>
                  <option value="video">Видео</option>
                  <option value="audio">Аудио</option>
                </select>
              </label>
              <label v-if="lessonKind !== 'text'" class="admin-field">
                <span>Файл урока</span>
                <input
                  class="text-input"
                  type="file"
                  :accept="lessonKind === 'photo' ? 'image/*' : lessonKind === 'video' ? 'video/*' : 'audio/*'"
                  aria-label="Файл урока"
                  @change="handleLessonFileChange"
                />
                <small>{{ lessonFileName || "Файл не выбран" }}</small>
              </label>
              <div v-if="lessonKind === 'audio'" class="voice-record-row">
                <button v-if="!isVoiceRecording" class="secondary-button" type="button" @click="startVoiceRecording">
                  <Mic class="h-4 w-4" aria-hidden="true" />
                  Записать голос
                </button>
                <button v-else class="secondary-button" type="button" @click="stopVoiceRecording">
                  <Square class="h-4 w-4" aria-hidden="true" />
                  Остановить запись
                </button>
              </div>
              <label class="admin-field">
                <span>Обложка карточки (не обязательно)</span>
                <input class="text-input" type="file" accept="image/*" aria-label="Обложка карточки" @change="handleLessonThumbnailChange" />
                <small v-if="lessonThumbnailFileName">{{ lessonThumbnailFileName }}</small>
              </label>
              <button
                v-if="selectedLessonItem?.thumbnailUrl || lessonThumbnailFileName"
                class="secondary-button cover-remove-button"
                type="button"
                @click="removeLessonThumbnail"
              >
                Удалить обложку
              </button>
              <label class="admin-field">
                <span>Содержимое урока</span>
                <textarea v-model="lessonContent" class="text-input lesson-content-input" placeholder="Текст урока или описание вложений" aria-label="Содержимое урока"></textarea>
              </label>
              <p v-if="lessonError" class="admin-error-text">{{ lessonError }}</p>
            </div>
          </div>

          <div class="admin-form-actions lesson-preview-actions" :class="{ 'lesson-preview-actions-edit': canManageModules }">
            <button
              v-if="canManageModules && selectedLessonItem"
              class="secondary-button lesson-delete-button"
              type="button"
              :disabled="isSaving"
              @click="deleteLesson"
            >
              <Trash2 class="h-4 w-4" aria-hidden="true" />
              Удалить урок
            </button>
            <button class="secondary-button" type="button" :disabled="isSaving" @click="closeLessonModal">Закрыть</button>
            <button v-if="canManageModules" class="primary-button" type="button" :disabled="isSaving" @click="saveLesson">
              {{ isSaving ? "Сохраняем..." : "Сохранить урок" }}
            </button>
          </div>
        </aside>
      </div>
    </Teleport>
  </section>
</template>
