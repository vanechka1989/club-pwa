<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  getYouTubeEmbedUrl,
  getYouTubeThumbnailUrl,
  isYouTubeMediaUrl,
  normalizeExternalMediaUrl,
  type AdminLearningMaterial,
  type AdminLearningUploadedObject,
  type ContentCardLayout,
  type ContentKind,
  type LearningCategory,
  type LearningContent,
  type LearningProgressSummary,
  type LessonMaterial,
  type MediaSource
} from "@club/shared";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Image,
  Maximize2,
  Mic,
  Minimize2,
  Pause,
  Pencil,
  Play,
  Plus,
  Square,
  Trash2,
  Video,
  Volume2,
  X
} from "lucide-vue-next";
import {
  createAdminLearningCategory,
  completeAdminLearningMultipartUpload,
  createAdminLearningMultipartUpload,
  createAdminLearningMaterial,
  createAdminLearningMaterialDirect,
  deleteAdminLearningCategory,
  deleteAdminLearningMaterial,
  getAdminLearning,
  getLearningContent,
  getLearningHome,
  reorderAdminLearningCategories,
  reorderAdminLearningMaterials,
  restoreAdminLearningMaterial,
  saveLearningPlayback,
  updateAdminLearningCategory,
  updateAdminLearningMaterial,
  updateAdminLearningMaterialDirect
} from "@/api/client";
import { useOperationIndicator } from "@/features/app/useOperationIndicator";
import { formatArchiveDeletionLabel } from "@/features/app/archiveCountdown";
import TaskScreen from "@/features/app/TaskScreen.vue";
import { useI18n } from "@/features/app/i18n";
import { useNotificationsStore } from "@/stores/notifications";
import { useLessonUploadsStore } from "@/stores/lessonUploads";
import { useSessionStore } from "@/stores/session";
import { useUiStore, type ColorScheme } from "@/stores/ui";
import { hasAdminCapability } from "@/features/admin/adminCapabilities";
import { getMaterialDraftError, type MediaInputSource } from "./materialForm";
import { moveItemByDirection, type SortDirection } from "./sortOrder";
import { createVoiceUpload, type NamedBlobUpload } from "./voiceUpload";

const route = useRoute() as ReturnType<typeof useRoute> | undefined;
const router = useRouter() as ReturnType<typeof useRouter> | undefined;

function openLearningTask(path: string) {
  if (route?.path !== path) {
    void router?.push(path);
  }
}

function closeLearningTask() {
  if (route?.path !== "/learning") {
    void router?.push("/learning");
  }
}

type ModuleLesson = {
  id: string;
  categoryId: string;
  kind: ContentKind;
  title: string;
  url: string;
  description: string;
  content: string;
  mediaUrl: string | null;
  mediaSource: MediaSource | null;
  thumbnailUrl: string | null;
  materials: LessonMaterial[];
  cardLayout: ContentCardLayout;
  isPersisted: boolean;
  archivedUntil: string | null;
};

type ModuleCard = {
  id: string;
  title: string;
  description: string;
  defaultCardLayout: ContentCardLayout;
  meta: string;
  isPersisted: boolean;
  images: ModuleLesson[];
};

type PlaybackPersistOptions = {
  force?: boolean;
  keepalive?: boolean;
};

type LessonMaterialDraft = {
  id: string;
  kind: ContentKind;
  title: string;
  description: string;
  body: string;
  existingKind: ContentKind | null;
  existingMediaSource: MediaSource | null;
  mediaSource: MediaInputSource;
  externalUrl: string;
  file: File | null;
  fileName: string;
  existingMediaUrl: string | null;
  existingMediaContentType: string | null;
  existingMediaSizeBytes: number | null;
};

const deletedContentModuleId = "deleted-content-module";

const initialModuleCards: ModuleCard[] = [
  {
    id: "module-1",
    title: "Модуль 1",
    description: "Первый модуль клуба. Внутри будут уроки и материалы первого блока.",
    defaultCardLayout: "vertical",
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
        mediaSource: null,
        thumbnailUrl: "/previews/learning-redesign-1.svg",
        materials: [],
        cardLayout: "vertical",
        isPersisted: false,
        archivedUntil: null
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
        mediaSource: null,
        thumbnailUrl: "/previews/learning-redesign-2.svg",
        materials: [],
        cardLayout: "horizontal",
        isPersisted: false,
        archivedUntil: null
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
        mediaSource: null,
        thumbnailUrl: "/previews/learning-redesign-3.svg",
        materials: [],
        cardLayout: "vertical",
        isPersisted: false,
        archivedUntil: null
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
        mediaSource: null,
        thumbnailUrl: "/previews/learning-redesign-4.svg",
        materials: [],
        cardLayout: "vertical",
        isPersisted: false,
        archivedUntil: null
      }
    ],
    meta: "Модуль клуба",
    isPersisted: false
  },
  {
    id: "module-2",
    title: "Модуль 2",
    description: "Второй модуль клуба. Внутри будут уроки следующего блока.",
    defaultCardLayout: "vertical",
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
        mediaSource: null,
        thumbnailUrl: "/previews/admin-stats-preview-1.png",
        materials: [],
        cardLayout: "vertical",
        isPersisted: false,
        archivedUntil: null
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
        mediaSource: null,
        thumbnailUrl: "/previews/admin-stats-preview-2.png",
        materials: [],
        cardLayout: "vertical",
        isPersisted: false,
        archivedUntil: null
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
        mediaSource: null,
        thumbnailUrl: "/previews/admin-stats-preview-3.png",
        materials: [],
        cardLayout: "vertical",
        isPersisted: false,
        archivedUntil: null
      }
    ],
    meta: "Модуль клуба",
    isPersisted: false
  }
];

const moduleCards = ref<ModuleCard[]>(initialModuleCards.map((module) => ({ ...module, images: module.images.map((lesson) => ({ ...lesson })) })));
const deletedLessons = ref<ModuleLesson[]>([]);
const learningProgress = ref<LearningProgressSummary | null>(null);
const session = useSessionStore();
const ui = useUiStore();
const notifications = useNotificationsStore();
const lessonUploads = useLessonUploadsStore();
const { t } = useI18n();
const modulesLoadedFromApi = ref(false);
const isLoadingModules = ref(false);
const isSaving = ref(false);
const isSorting = ref(false);
const showModuleModal = ref(false);
const editingModuleId = ref<string | null>(null);
const collapsedModuleIds = ref<string[]>(initialModuleCards.map((module) => module.id));
const moduleCollapseTouched = ref(false);
const moduleTitle = ref("");
const moduleDescription = ref("");
const moduleDefaultCardLayout = ref<ContentCardLayout>("vertical");
const moduleError = ref("");
const selectedLesson = ref<{ moduleId: string; lessonId: string | null } | null>(null);
const lessonTitle = ref("");
const lessonDescription = ref("");
const lessonKind = ref<ContentKind>("text");
const lessonMediaSource = ref<MediaInputSource>("file");
const lessonExternalUrl = ref("");
const lessonFile = ref<File | NamedBlobUpload | null>(null);
const lessonFileName = ref("");
const lessonThumbnailFile = ref<File | null>(null);
const lessonThumbnailFileName = ref("");
const shouldRemoveLessonThumbnail = ref(false);
const lessonCardLayout = ref<ContentCardLayout>("vertical");
const lessonContent = ref("");
const lessonMaterialDrafts = ref<LessonMaterialDraft[]>([]);
const lessonError = ref("");
const isLoadingLessonContent = ref(false);
const lessonViewerError = ref("");
const isVoiceRecording = ref(false);
const voiceRecorder = ref<MediaRecorder | null>(null);
const voiceStream = ref<MediaStream | null>(null);
const lessonUploadProgress = ref<number | null>(null);
const lessonVideoElement = ref<HTMLVideoElement | null>(null);
const isLessonVideoPlaying = ref(false);
const lessonVideoCurrentTime = ref(0);
const lessonVideoDuration = ref(0);
const isLessonVideoFullscreen = ref(false);
const showLessonVideoControls = ref(true);
const pendingLessonVideoStartSeconds = ref(0);
const lessonVideoStartApplied = ref(false);
const lastSavedLessonVideoSeconds = ref(0);
const pendingPlaybackSaveKey = ref<string | null>(null);
const pendingPlaybackMaterialId = ref<string | null>(null);
const lastTrackedStaticMaterialId = ref<string | null>(null);
let voiceChunks: Blob[] = [];
let lessonVideoControlsTimer: number | null = null;
let lessonMaterialObserver: IntersectionObserver | null = null;

const canManageModules = computed(() =>
  hasAdminCapability(session.user?.role, session.user?.adminPermissions, "materials")
);
const editingModule = computed(() => moduleCards.value.find((module) => module.id === editingModuleId.value) ?? null);
const moduleModalTitle = computed(() => (editingModule.value ? "Редактировать модуль" : "Новый модуль"));
const moduleModalDescription = computed(() => (editingModule.value ? "Измените название, описание и формат карточек." : "Название, описание и формат карточек модуля."));
const trimmedModuleTitle = computed(() => moduleTitle.value.trim());
const selectedLessonModule = computed(() => moduleCards.value.find((module) => module.id === selectedLesson.value?.moduleId) ?? null);
const selectedLessonItem = computed(() => selectedLessonModule.value?.images.find((lesson) => lesson.id === selectedLesson.value?.lessonId) ?? null);
const lastOpenedLesson = computed(() => {
  const item = learningProgress.value?.lastOpenedItem;
  return item ? materialToLesson(item) : null;
});
const lastOpenedMaterial = computed(() => {
  const materialId = learningProgress.value?.lastOpenedMaterialId;
  return materialId ? lastOpenedLesson.value?.materials.find((material) => material.id === materialId) ?? null : null;
});
const lastOpenedLessonModule = computed(() => {
  const lesson = lastOpenedLesson.value;
  return lesson ? moduleCards.value.find((module) => module.id === lesson.categoryId) ?? null : null;
});
const shouldShowContinueLesson = computed(() => Boolean(!canManageModules.value && lastOpenedLesson.value && lastOpenedLessonModule.value));
const continueLessonTitle = computed(() => lastOpenedLessonModule.value?.title ?? "");
const continueLessonKind = computed(() => lastOpenedMaterial.value?.kind ?? lastOpenedLesson.value?.kind ?? "text");
const continueLessonContext = computed(() => {
  return lastOpenedMaterial.value?.title ?? lastOpenedLesson.value?.title ?? "";
});
const continueLessonButtonLabel = computed(() =>
  lastOpenedLesson.value ? `${t("modulesContinueLesson")} ${lastOpenedLesson.value.title}` : t("modulesContinueLesson")
);
const continueLessonCardClasses = computed(() => [
  "continue-lesson-card",
  lastOpenedLesson.value?.cardLayout === "horizontal" ? "continue-lesson-card-horizontal" : "continue-lesson-card-vertical"
]);
const continueLessonProgressLabel = computed(() => {
  const seconds = learningProgress.value?.lastOpenedPlaybackPositionSeconds ?? 0;
  if (isResumableMediaKind(continueLessonKind.value) && seconds > 0) {
    return `${t("modulesContinueFrom")} ${formatVideoTime(seconds)}`;
  }

  return t("modulesContinue");
});
const contentKindOptions: Array<{ value: ContentKind; label: string; accept: string }> = [
  { value: "text", label: "Текст", accept: "" },
  { value: "photo", label: "Фото", accept: "image/*" },
  { value: "video", label: "Видео", accept: "video/*" },
  { value: "audio", label: "Аудио", accept: "audio/*" }
];
const mediaInputSourceOptions: Array<{ value: MediaInputSource; label: string }> = [
  { value: "file", label: "Файл" },
  { value: "url", label: "Ссылка" },
  { value: "youtube", label: "YouTube" }
];
const lessonModalTitle = computed(() => (selectedLessonItem.value ? selectedLessonItem.value.title : "Новый урок"));
const lessonModalSubtitle = computed(() => selectedLessonModule.value?.title ?? "Модуль");
const trimmedLessonTitle = computed(() => lessonTitle.value.trim());
const selectedModuleLessonLayout = computed(() => selectedLessonModule.value?.defaultCardLayout ?? "vertical");
function getMediaInputSource(kind: ContentKind, mediaUrl: string | null, mediaSource: MediaSource | null | undefined): MediaInputSource {
  if (kind === "text") {
    return "file";
  }

  if (mediaSource === "external" && mediaUrl) {
    return isYouTubeMediaUrl(mediaUrl) ? "youtube" : "url";
  }

  return "file";
}

function getExternalUrlForForm(mediaUrl: string | null, source: MediaInputSource) {
  return source === "file" ? "" : mediaUrl ?? "";
}

function getNormalizedExternalUrl(source: MediaInputSource, value: string) {
  if (source === "file") {
    return null;
  }

  return normalizeExternalMediaUrl(value);
}

function getVisibleMediaInputSources(kind: ContentKind) {
  return mediaInputSourceOptions.filter((option) => option.value !== "youtube" || kind === "video");
}

function getYouTubePlayerUrl(value: string | null) {
  return getYouTubeEmbedUrl(value);
}

function isYouTubeLessonImage(item: Pick<ModuleLesson, "mediaUrl">) {
  return Boolean(getYouTubeThumbnailUrl(item.mediaUrl));
}

function syncLessonYouTubeExternalUrl() {
  if (lessonMediaSource.value === "file" || !isYouTubeMediaUrl(lessonExternalUrl.value)) {
    return;
  }

  lessonKind.value = "video";
  lessonMediaSource.value = "youtube";
  lessonFile.value = null;
  lessonFileName.value = "";
}

function syncLessonMaterialYouTubeExternalUrl(material: LessonMaterialDraft) {
  if (material.mediaSource === "file" || !isYouTubeMediaUrl(material.externalUrl)) {
    return;
  }

  material.kind = "video";
  material.mediaSource = "youtube";
  material.file = null;
  material.fileName = "";
}

watch(lessonExternalUrl, syncLessonYouTubeExternalUrl);
watch(
  lessonMaterialDrafts,
  (materials) => {
    materials.forEach(syncLessonMaterialYouTubeExternalUrl);
  },
  { deep: true }
);
const lessonPreviewSource = computed(() => {
  if (selectedLessonItem.value) {
    return getModuleLessonImage(selectedLessonModule.value, selectedLessonItem.value);
  }

  return getDefaultLessonCover(ui.colorScheme, selectedModuleLessonLayout.value);
});
const lessonVideoPoster = computed(() =>
  selectedLessonItem.value ? getModuleLessonImage(selectedLessonModule.value, selectedLessonItem.value) : lessonPreviewSource.value
);
const lessonVideoProgress = computed(() =>
  lessonVideoDuration.value > 0 ? Math.min(100, Math.max(0, (lessonVideoCurrentTime.value / lessonVideoDuration.value) * 100)) : 0
);
const learningOperation = computed(() => {
  if (!isSaving.value) {
    return null;
  }

  if (selectedLesson.value) {
    const hasUpload = Boolean(lessonFile.value || lessonThumbnailFile.value);
    const progressText = lessonUploadProgress.value !== null ? `Загрузка ${lessonUploadProgress.value}%` : "Загрузка файла и обновление данных";
    return {
      title: hasUpload ? "Загружаем урок..." : "Сохраняем урок...",
      detail: hasUpload ? progressText : "Обновляем материал урока"
    };
  }

  if (showModuleModal.value) {
    return {
      title: editingModule.value ? "Сохраняем модуль..." : "Создаём модуль...",
      detail: "Обновляем структуру обучения"
    };
  }

  return {
    title: "Обновляем обучение...",
    detail: "Сохраняем изменения"
  };
});

useOperationIndicator(learningOperation);

function lessonCountLabel(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${count} ${t("modulesLessonMany")}`;
  }

  if (last === 1) {
    return `${count} ${t("modulesLessonOne")}`;
  }

  if (last >= 2 && last <= 4) {
    return `${count} ${t("modulesLessonFew")}`;
  }

  return `${count} ${t("modulesLessonMany")}`;
}

function clearModuleError() {
  moduleError.value = "";
}

function showModuleError(text: string) {
  moduleError.value = text;
  notifications.showError(text);
}

function clearLessonError() {
  lessonError.value = "";
}

function showLessonError(text: string) {
  lessonError.value = text;
  notifications.showError(text);
}

function clearLessonViewerError() {
  lessonViewerError.value = "";
}

function showLessonViewerError(text: string) {
  lessonViewerError.value = text;
  notifications.showError(text);
}

function openModuleModal() {
  editingModuleId.value = null;
  moduleTitle.value = "";
  moduleDescription.value = "";
  moduleDefaultCardLayout.value = "vertical";
  clearModuleError();
  showModuleModal.value = true;
  openLearningTask("/learning/modules/new");
}

function openModuleEditModal(module: ModuleCard) {
  editingModuleId.value = module.id;
  moduleTitle.value = module.title;
  moduleDescription.value = module.description;
  moduleDefaultCardLayout.value = module.defaultCardLayout;
  clearModuleError();
  showModuleModal.value = true;
  openLearningTask(`/learning/modules/${module.id}/edit`);
}

function closeModuleModal() {
  showModuleModal.value = false;
  editingModuleId.value = null;
  moduleTitle.value = "";
  moduleDescription.value = "";
  moduleDefaultCardLayout.value = "vertical";
  clearModuleError();
  closeLearningTask();
}

function isModuleCollapsed(moduleId: string) {
  return collapsedModuleIds.value.includes(moduleId);
}

function toggleModule(moduleId: string) {
  moduleCollapseTouched.value = true;
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

function cloneModuleCardsForRollback() {
  return moduleCards.value.map((module) => ({
    ...module,
    images: module.images.map((lesson) => ({ ...lesson }))
  }));
}

async function persistModuleOrder(previousCards: ModuleCard[]) {
  if (!modulesLoadedFromApi.value || !moduleCards.value.every((module) => module.isPersisted)) {
    return;
  }

  isSorting.value = true;
  clearModuleError();

  try {
    await reorderAdminLearningCategories(moduleCards.value.map((module) => module.id));
  } catch {
    moduleCards.value = previousCards;
    showModuleError("Не удалось сохранить порядок модулей.");
  } finally {
    isSorting.value = false;
  }
}

async function persistLessonOrder(moduleId: string, previousCards: ModuleCard[]) {
  const module = moduleCards.value.find((item) => item.id === moduleId);
  if (!modulesLoadedFromApi.value || !module?.isPersisted || !module.images.every((lesson) => lesson.isPersisted)) {
    return;
  }

  isSorting.value = true;
  clearModuleError();

  try {
    await reorderAdminLearningMaterials(
      moduleId,
      module.images.map((lesson) => lesson.id)
    );
  } catch {
    moduleCards.value = previousCards;
    showModuleError("Не удалось сохранить порядок уроков.");
  } finally {
    isSorting.value = false;
  }
}

async function moveModuleOrder(moduleId: string, direction: SortDirection) {
  if (!canManageModules.value || isSorting.value) {
    return;
  }

  const currentCards = moduleCards.value;
  const nextCards = moveItemByDirection(currentCards, moduleId, direction);
  if (nextCards === currentCards) {
    return;
  }

  const previousCards = cloneModuleCardsForRollback();
  moduleCards.value = nextCards;
  await persistModuleOrder(previousCards);
}

async function moveLessonOrder(moduleId: string, lessonId: string, direction: SortDirection) {
  if (!canManageModules.value || isSorting.value) {
    return;
  }

  const module = moduleCards.value.find((item) => item.id === moduleId);
  if (!module) {
    return;
  }

  const nextLessons = moveItemByDirection(module.images, lessonId, direction);
  if (nextLessons === module.images) {
    return;
  }

  const previousCards = cloneModuleCardsForRollback();
  moduleCards.value = moduleCards.value.map((item) => (item.id === moduleId ? { ...item, images: nextLessons } : item));
  await persistLessonOrder(moduleId, previousCards);
}

function createLessonMaterialDraft(material?: LessonMaterial): LessonMaterialDraft {
  const mediaSource = getMediaInputSource(material?.kind ?? "text", material?.mediaUrl ?? null, material?.mediaSource);
  return {
    id: material?.id ?? `lesson-material-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind: material?.kind ?? "text",
    title: material?.title ?? "",
    description: material?.description ?? "",
    body: material?.body ?? "",
    existingKind: material?.kind ?? null,
    existingMediaSource: material?.mediaSource ?? null,
    mediaSource,
    externalUrl: getExternalUrlForForm(material?.mediaUrl ?? null, mediaSource),
    file: null,
    fileName: material?.mediaUrl && mediaSource === "file" ? "Текущий файл сохранён" : "",
    existingMediaUrl: material?.mediaUrl ?? null,
    existingMediaContentType: material?.mediaContentType ?? null,
    existingMediaSizeBytes: material?.mediaSizeBytes ?? null
  };
}

function openLessonModal(module: ModuleCard, lesson: ModuleLesson, playbackStartSeconds = 0, materialId: string | null = null) {
  resetLessonVideoState();
  if (!module.images.some((item) => item.id === lesson.id)) {
    module.images = [lesson, ...module.images];
  }
  selectedLesson.value = { moduleId: module.id, lessonId: lesson.id };
  pendingPlaybackMaterialId.value = materialId;
  pendingLessonVideoStartSeconds.value = playbackStartSeconds;
  lessonVideoStartApplied.value = false;
  lastSavedLessonVideoSeconds.value = playbackStartSeconds;
  lessonTitle.value = lesson.title;
  lessonDescription.value = lesson.description;
  lessonKind.value = lesson.kind;
  lessonMediaSource.value = getMediaInputSource(lesson.kind, lesson.mediaUrl, lesson.mediaSource);
  lessonExternalUrl.value = getExternalUrlForForm(lesson.mediaUrl, lessonMediaSource.value);
  lessonFile.value = null;
  lessonFileName.value = lesson.mediaUrl && lessonMediaSource.value === "file" ? "Текущий файл сохранён" : "";
  lessonThumbnailFile.value = null;
  lessonThumbnailFileName.value = lesson.thumbnailUrl ? "Текущая обложка сохранена" : "";
  shouldRemoveLessonThumbnail.value = false;
  lessonCardLayout.value = module.defaultCardLayout;
  lessonContent.value = lesson.content;
  lessonMaterialDrafts.value = lesson.materials.map(createLessonMaterialDraft);
  clearLessonError();
  isLoadingLessonContent.value = false;
  clearLessonViewerError();
  void loadLessonContentForMember(lesson);
  if (canManageModules.value) {
    openLearningTask(`/learning/lessons/${lesson.id}/edit`);
  } else {
    openLearningTask(`/learning/lessons/${lesson.id}`);
  }
}

function openLastLesson() {
  const module = lastOpenedLessonModule.value;
  const lesson = lastOpenedLesson.value;
  if (!module || !lesson) {
    return;
  }

  openLessonModal(
    module,
    lesson,
    learningProgress.value?.lastOpenedPlaybackPositionSeconds ?? 0,
    learningProgress.value?.lastOpenedMaterialId ?? null
  );
}

function openLessonCreateModal(module: ModuleCard) {
  if (!canManageModules.value) {
    return;
  }

  selectedLesson.value = { moduleId: module.id, lessonId: null };
  lessonTitle.value = "";
  lessonDescription.value = "";
  lessonKind.value = "text";
  lessonMediaSource.value = "file";
  lessonExternalUrl.value = "";
  lessonFile.value = null;
  lessonFileName.value = "";
  lessonThumbnailFile.value = null;
  lessonThumbnailFileName.value = "";
  shouldRemoveLessonThumbnail.value = false;
  lessonCardLayout.value = module.defaultCardLayout;
  lessonContent.value = "";
  lessonMaterialDrafts.value = [];
  clearLessonError();
  isLoadingLessonContent.value = false;
  clearLessonViewerError();
  openLearningTask(`/learning/lessons/new/${module.id}`);
}

function closeLessonModal() {
  resetLessonVideoState();
  selectedLesson.value = null;
  lessonTitle.value = "";
  lessonDescription.value = "";
  lessonKind.value = "text";
  lessonMediaSource.value = "file";
  lessonExternalUrl.value = "";
  lessonFile.value = null;
  lessonFileName.value = "";
  lessonThumbnailFile.value = null;
  lessonThumbnailFileName.value = "";
  shouldRemoveLessonThumbnail.value = false;
  lessonCardLayout.value = "vertical";
  lessonContent.value = "";
  lessonMaterialDrafts.value = [];
  clearLessonError();
  isLoadingLessonContent.value = false;
  clearLessonViewerError();
  closeLearningTask();
}

function resetLessonVideoState() {
  clearLessonVideoControlsTimer();
  isLessonVideoFullscreen.value = false;
  isLessonVideoPlaying.value = false;
  showLessonVideoControls.value = true;
  lessonVideoCurrentTime.value = 0;
  lessonVideoDuration.value = 0;
  pendingLessonVideoStartSeconds.value = 0;
  lessonVideoStartApplied.value = false;
  lastSavedLessonVideoSeconds.value = 0;
  pendingPlaybackSaveKey.value = null;
  pendingPlaybackMaterialId.value = null;
  lastTrackedStaticMaterialId.value = null;
  clearLessonMaterialObserver();
}

function formatVideoTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const restSeconds = rounded % 60;
  return `${minutes}:${restSeconds.toString().padStart(2, "0")}`;
}

function isResumableMediaKind(kind: ContentKind) {
  return kind === "video" || kind === "audio";
}

function syncLessonVideoState() {
  const video = lessonVideoElement.value;
  if (!video) {
    return;
  }

  lessonVideoCurrentTime.value = video.currentTime;
  lessonVideoDuration.value = Number.isFinite(video.duration) ? video.duration : 0;
  isLessonVideoPlaying.value = !video.paused && !video.ended;
}

function applyPendingLessonVideoStart() {
  const video = lessonVideoElement.value;
  if (!video || pendingPlaybackMaterialId.value || lessonVideoStartApplied.value || pendingLessonVideoStartSeconds.value <= 0) {
    syncLessonVideoState();
    return;
  }

  const targetSeconds =
    Number.isFinite(video.duration) && video.duration > 0
      ? Math.min(pendingLessonVideoStartSeconds.value, Math.max(0, video.duration - 0.25))
      : pendingLessonVideoStartSeconds.value;

  try {
    video.currentTime = targetSeconds;
  } catch {
    syncLessonVideoState();
    return;
  }

  if (Math.abs(video.currentTime - targetSeconds) > 0.5) {
    syncLessonVideoState();
    return;
  }

  lessonVideoStartApplied.value = true;
  lastSavedLessonVideoSeconds.value = Math.floor(targetSeconds);
  syncLessonVideoState();
}

function updateLearningPlaybackProgress(lesson: ModuleLesson, positionSeconds: number, material: LessonMaterial | null = null) {
  if (!learningProgress.value) {
    return;
  }

  const openedAt = new Date().toISOString();
  const lastOpenedItem: LearningContent =
    learningProgress.value.lastOpenedItem?.id === lesson.id
      ? learningProgress.value.lastOpenedItem
      : {
          id: lesson.id,
          categoryId: lesson.categoryId,
          kind: lesson.kind,
          title: lesson.title,
          summary: lesson.description || null,
          body: lesson.content || null,
          mediaUrl: lesson.mediaUrl,
          mediaSource: lesson.mediaSource,
          thumbnailUrl: lesson.thumbnailUrl,
          cardLayout: lesson.cardLayout,
          mediaContentType: null,
          mediaSizeBytes: null,
          materials: lesson.materials,
          publishedAt: openedAt
        };

  learningProgress.value = {
    ...learningProgress.value,
    lastOpenedItem,
    lastOpenedMaterialId: material?.id ?? null,
    lastOpenedAt: openedAt,
    lastOpenedPlaybackPositionSeconds: positionSeconds
  };
}

async function persistLessonVideoPlayback(options: PlaybackPersistOptions | boolean = {}) {
  const force = typeof options === "boolean" ? options : options.force ?? false;
  const keepalive = typeof options === "boolean" ? false : options.keepalive ?? false;
  const lesson = selectedLessonItem.value;
  const video = lessonVideoElement.value;
  if (!lesson?.isPersisted || !isResumableMediaKind(lesson.kind) || !video) {
    return;
  }

  if (pendingLessonVideoStartSeconds.value > 0 && !lessonVideoStartApplied.value) {
    applyPendingLessonVideoStart();
    if (!lessonVideoStartApplied.value) {
      return;
    }
  }

  const positionSeconds = Math.max(0, Math.floor(video.currentTime));
  if (!force && Math.abs(positionSeconds - lastSavedLessonVideoSeconds.value) < 5) {
    return;
  }

  const saveKey = `${lesson.id}:main:${positionSeconds}`;
  if (pendingPlaybackSaveKey.value === saveKey) {
    return;
  }

  pendingPlaybackSaveKey.value = saveKey;
  try {
    const response = await saveLearningPlayback(
      lesson.id,
      positionSeconds,
      keepalive ? { keepalive: true } : undefined
    );
    const savedSeconds = response.playbackPositionSeconds ?? positionSeconds;
    lastSavedLessonVideoSeconds.value = savedSeconds;
    updateLearningPlaybackProgress(lesson, savedSeconds, null);
  } catch {
    // Keep the previous saved marker so the next event retries this position.
  } finally {
    if (pendingPlaybackSaveKey.value === saveKey) {
      pendingPlaybackSaveKey.value = null;
    }
  }
}

function persistLessonVideoPlaybackBeforeExit() {
  void persistLessonVideoPlayback({ force: true, keepalive: true });
}

function handleLearningVisibilityChange() {
  if (document.visibilityState === "hidden") {
    persistLessonVideoPlaybackBeforeExit();
  }
}

function handleLessonVideoTimeUpdate() {
  syncLessonVideoState();
  if (pendingLessonVideoStartSeconds.value > 0 && !lessonVideoStartApplied.value) {
    applyPendingLessonVideoStart();
    return;
  }
  void persistLessonVideoPlayback(false);
}

function getMediaElement(event: Event) {
  return event.currentTarget instanceof HTMLMediaElement ? event.currentTarget : null;
}

function applyPendingLessonMaterialStart(material: LessonMaterial, event: Event) {
  const media = getMediaElement(event);
  if (!media || lessonVideoStartApplied.value || pendingPlaybackMaterialId.value !== material.id || pendingLessonVideoStartSeconds.value <= 0) {
    return;
  }

  const targetSeconds =
    Number.isFinite(media.duration) && media.duration > 0
      ? Math.min(pendingLessonVideoStartSeconds.value, Math.max(0, media.duration - 0.25))
      : pendingLessonVideoStartSeconds.value;

  try {
    media.currentTime = targetSeconds;
  } catch {
    return;
  }

  if (Math.abs(media.currentTime - targetSeconds) > 0.5) {
    return;
  }

  lessonVideoStartApplied.value = true;
  lastSavedLessonVideoSeconds.value = Math.floor(targetSeconds);
}

async function persistLessonMaterialPlayback(
  material: LessonMaterial,
  event: Event,
  options: PlaybackPersistOptions | boolean = {}
) {
  const force = typeof options === "boolean" ? options : options.force ?? false;
  const keepalive = typeof options === "boolean" ? false : options.keepalive ?? false;
  const lesson = selectedLessonItem.value;
  const media = getMediaElement(event);
  if (!lesson?.isPersisted || !isResumableMediaKind(material.kind) || !media) {
    return;
  }

  if (pendingPlaybackMaterialId.value === material.id && pendingLessonVideoStartSeconds.value > 0 && !lessonVideoStartApplied.value) {
    applyPendingLessonMaterialStart(material, event);
    if (!lessonVideoStartApplied.value) {
      return;
    }
  }

  const positionSeconds = Math.max(0, Math.floor(media.currentTime));
  if (!force && Math.abs(positionSeconds - lastSavedLessonVideoSeconds.value) < 5) {
    return;
  }

  const saveKey = `${lesson.id}:${material.id}:${positionSeconds}`;
  if (pendingPlaybackSaveKey.value === saveKey) {
    return;
  }

  pendingPlaybackSaveKey.value = saveKey;
  try {
    const response = await saveLearningPlayback(lesson.id, positionSeconds, {
      ...(keepalive ? { keepalive: true } : {}),
      materialId: material.id
    });
    const savedSeconds = response.playbackPositionSeconds ?? positionSeconds;
    lastSavedLessonVideoSeconds.value = savedSeconds;
    updateLearningPlaybackProgress(lesson, savedSeconds, material);
  } catch {
    // Keep the previous saved marker so the next event retries this position.
  } finally {
    if (pendingPlaybackSaveKey.value === saveKey) {
      pendingPlaybackSaveKey.value = null;
    }
  }
}

function handleLessonMaterialTimeUpdate(material: LessonMaterial, event: Event) {
  void persistLessonMaterialPlayback(material, event, false);
}

function findLessonMaterialElement(materialId: string) {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-lesson-material-id]")).find(
    (element) => element.dataset.lessonMaterialId === materialId
  );
}

function scrollToPendingLessonMaterial() {
  const materialId = pendingPlaybackMaterialId.value;
  if (!materialId) {
    return;
  }

  const element = findLessonMaterialElement(materialId);
  element?.scrollIntoView({ block: "center", behavior: "smooth" });
}

function clearLessonMaterialObserver() {
  lessonMaterialObserver?.disconnect();
  lessonMaterialObserver = null;
}

function setupLessonMaterialObserver() {
  clearLessonMaterialObserver();
  const lesson = selectedLessonItem.value;
  if (canManageModules.value || !lesson?.isPersisted || typeof IntersectionObserver === "undefined") {
    return;
  }

  const staticMaterials = lesson.materials.filter((material) => material.kind === "text" || material.kind === "photo");
  if (!staticMaterials.length) {
    return;
  }

  const materialById = new Map(staticMaterials.map((material) => [material.id, material]));
  const root = document.querySelector(".lesson-preview-scroll");
  lessonMaterialObserver = new IntersectionObserver(
    (entries) => {
      const visibleEntry = entries
        .filter((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.6)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const materialId =
        visibleEntry?.target instanceof HTMLElement ? visibleEntry.target.dataset.lessonMaterialId ?? null : null;
      const material = materialId ? materialById.get(materialId) ?? null : null;
      if (material) {
        void trackStaticLessonMaterial(material);
      }
    },
    {
      root,
      threshold: [0.6]
    }
  );

  for (const material of staticMaterials) {
    const element = findLessonMaterialElement(material.id);
    if (element) {
      lessonMaterialObserver.observe(element);
    }
  }
}

async function trackStaticLessonMaterial(material: LessonMaterial) {
  const lesson = selectedLessonItem.value;
  if (!lesson?.isPersisted || lastTrackedStaticMaterialId.value === material.id) {
    return;
  }

  lastTrackedStaticMaterialId.value = material.id;
  updateLearningPlaybackProgress(lesson, 0, material);
  try {
    await saveLearningPlayback(lesson.id, 0, { materialId: material.id });
  } catch {
    lastTrackedStaticMaterialId.value = null;
  }
}

function clearLessonVideoControlsTimer() {
  if (lessonVideoControlsTimer !== null) {
    window.clearTimeout(lessonVideoControlsTimer);
    lessonVideoControlsTimer = null;
  }
}

function revealLessonVideoControls() {
  showLessonVideoControls.value = true;
  clearLessonVideoControlsTimer();

  if (!isLessonVideoPlaying.value) {
    return;
  }

  lessonVideoControlsTimer = window.setTimeout(() => {
    showLessonVideoControls.value = false;
    lessonVideoControlsTimer = null;
  }, 2200);
}

async function toggleLessonVideoPlayback() {
  const video = lessonVideoElement.value;
  if (!video) {
    return;
  }

  if (video.paused || video.ended) {
    await video.play().catch(() => {});
  } else {
    video.pause();
    void persistLessonVideoPlayback(true);
  }
  syncLessonVideoState();
  revealLessonVideoControls();
}

function handleLessonVideoSeek(event: Event) {
  const video = lessonVideoElement.value;
  const input = event.target as HTMLInputElement;
  if (!video || !lessonVideoDuration.value) {
    return;
  }

  video.currentTime = (Number(input.value) / 100) * lessonVideoDuration.value;
  syncLessonVideoState();
  void persistLessonVideoPlayback(true);
  revealLessonVideoControls();
}

async function toggleLessonVideoFullscreen() {
  const player = lessonVideoElement.value?.closest(".lesson-video-player") as HTMLElement | null;
  if (!player) {
    return;
  }

  if (isLessonVideoFullscreen.value) {
    isLessonVideoFullscreen.value = false;
    revealLessonVideoControls();
    return;
  }

  isLessonVideoFullscreen.value = true;
  revealLessonVideoControls();
}

async function handleLessonVideoEnded() {
  syncLessonVideoState();
  await persistLessonVideoPlayback(true);
  showLessonVideoControls.value = true;
  clearLessonVideoControlsTimer();

  isLessonVideoFullscreen.value = false;
}

function cloneInitialModules() {
  return initialModuleCards.map((module) => ({ ...module, images: module.images.map((lesson) => ({ ...lesson })) }));
}

function materialPreviewUrl(item: AdminLearningMaterial | LearningContent) {
  return item.thumbnailUrl || getYouTubeThumbnailUrl(item.mediaUrl) || getDefaultLessonCover(ui.colorScheme, item.cardLayout);
}

function getDefaultLessonCover(colorScheme: ColorScheme, cardLayout: ContentCardLayout) {
  return `/previews/default-lessons/${colorScheme}-${cardLayout}.webp`;
}

function getLessonImage(item: ModuleLesson) {
  return item.thumbnailUrl || getYouTubeThumbnailUrl(item.mediaUrl) || getDefaultLessonCover(ui.colorScheme, item.cardLayout);
}

function getModuleLessonImage(module: ModuleCard | null, item: ModuleLesson) {
  return item.thumbnailUrl || getYouTubeThumbnailUrl(item.mediaUrl) || getDefaultLessonCover(ui.colorScheme, module?.defaultCardLayout ?? item.cardLayout);
}

function getContinueLessonImage(module: ModuleCard | null, item: ModuleLesson) {
  const material = lastOpenedMaterial.value;
  if (material?.kind === "photo" && material.mediaUrl) {
    return material.mediaUrl;
  }

  if (material) {
    return getYouTubeThumbnailUrl(material.mediaUrl) || getDefaultLessonCover(ui.colorScheme, module?.defaultCardLayout ?? item.cardLayout);
  }

  return getModuleLessonImage(module, item);
}

function materialToLesson(item: AdminLearningMaterial | LearningContent): ModuleLesson {
  const archivedUntil = "archivedUntil" in item ? item.archivedUntil : null;
  return {
    id: item.id,
    categoryId: item.categoryId,
    kind: item.kind,
    title: item.title,
    url: materialPreviewUrl(item),
    description: item.summary ?? "",
    content: item.body ?? "",
    mediaUrl: item.mediaUrl,
    mediaSource: item.mediaSource ?? null,
    thumbnailUrl: item.thumbnailUrl,
    materials: item.materials ?? [],
    cardLayout: item.cardLayout,
    isPersisted: true,
    archivedUntil
  };
}

function replaceModuleLesson(lessonData: ModuleLesson) {
  moduleCards.value = moduleCards.value.map((module) =>
    module.id === lessonData.categoryId
      ? {
          ...module,
          images: module.images.map((lesson) => (lesson.id === lessonData.id ? { ...lesson, ...lessonData } : lesson))
        }
      : module
  );
}

async function loadLessonContentForMember(lesson: ModuleLesson) {
  if (canManageModules.value || !lesson.isPersisted) {
    return;
  }

  const lessonId = lesson.id;
  isLoadingLessonContent.value = true;
  clearLessonViewerError();

  try {
    const response = await getLearningContent(lessonId);
    if (selectedLesson.value?.lessonId !== lessonId) {
      return;
    }

    replaceModuleLesson(materialToLesson(response.item));
    if (!pendingPlaybackMaterialId.value && response.lastOpenedMaterialId) {
      pendingPlaybackMaterialId.value = response.lastOpenedMaterialId;
    }
    pendingLessonVideoStartSeconds.value = Math.max(pendingLessonVideoStartSeconds.value, response.playbackPositionSeconds ?? 0);
    lastSavedLessonVideoSeconds.value = pendingLessonVideoStartSeconds.value;
    void nextTick().then(() => {
      applyPendingLessonVideoStart();
      scrollToPendingLessonMaterial();
      setupLessonMaterialObserver();
    });
  } catch {
    if (selectedLesson.value?.lessonId === lessonId) {
      showLessonViewerError("Не удалось загрузить содержимое урока.");
    }
  } finally {
    if (selectedLesson.value?.lessonId === lessonId) {
      isLoadingLessonContent.value = false;
    }
  }
}

function categoriesToModules(
  categories: LearningCategory[],
  materials: Array<AdminLearningMaterial | LearningContent>,
  meta = "Модуль клуба"
) {
  return categories.map((category) => ({
    id: category.id,
    title: category.title,
    description: category.description ?? "",
    defaultCardLayout: category.defaultCardLayout,
    meta,
    isPersisted: true,
    images: materials.filter((material) => material.categoryId === category.id).map(materialToLesson)
  }));
}

async function loadModules() {
  isLoadingModules.value = true;

  try {
    if (canManageModules.value) {
      learningProgress.value = null;
      const response = await getAdminLearning();
      const modules = categoriesToModules(response.categories, response.materials);
      moduleCards.value = modules.length ? modules : cloneInitialModules();
      deletedLessons.value = response.deletedMaterials.map(materialToLesson);
    } else {
      const response = await getLearningHome();
      learningProgress.value = response.progress;
      const modules = categoriesToModules(response.categories, response.featured);
      moduleCards.value = modules.length ? modules : cloneInitialModules();
      deletedLessons.value = [];
    }
    modulesLoadedFromApi.value = true;
    if (!moduleCollapseTouched.value) {
      collapseAllModules();
    }
  } catch {
    moduleCards.value = moduleCards.value.length ? moduleCards.value : cloneInitialModules();
    deletedLessons.value = [];
    learningProgress.value = null;
    modulesLoadedFromApi.value = false;
    if (!moduleCollapseTouched.value) {
      collapseAllModules();
    }
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
          description: category.description ?? module.description,
          defaultCardLayout: category.defaultCardLayout
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

function getUploadParts(file: File | NamedBlobUpload) {
  if (file instanceof File) {
    return {
      blob: file,
      name: file.name,
      contentType: file.type || "application/octet-stream",
      sizeBytes: file.size
    };
  }

  return {
    blob: file.blob,
    name: file.name,
    contentType: file.blob.type || "application/octet-stream",
    sizeBytes: file.blob.size
  };
}

function throwIfUploadCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Загрузка отменена.", "AbortError");
  }
}

function isUploadCancelled(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function putDirectLearningUploadPart(uploadUrl: string, blob: Blob, onProgress: (loadedBytes: number) => void, signal?: AbortSignal) {
  return new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abortUpload = () => {
      request.abort();
      reject(new DOMException("Загрузка отменена.", "AbortError"));
    };

    if (signal?.aborted) {
      reject(new DOMException("Загрузка отменена.", "AbortError"));
      return;
    }

    signal?.addEventListener("abort", abortUpload, { once: true });
    request.open("PUT", uploadUrl);
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }
      onProgress(event.loaded);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        const etag = request.getResponseHeader("ETag");
        if (!etag) {
          reject(new Error("S3 не вернул ETag для части файла. Проверь ExposeHeaders: ETag в CORS."));
          return;
        }
        onProgress(blob.size);
        signal?.removeEventListener("abort", abortUpload);
        resolve(etag);
        return;
      }
      signal?.removeEventListener("abort", abortUpload);
      reject(new Error(`S3 upload failed with status ${request.status}`));
    };
    request.onerror = () => {
      signal?.removeEventListener("abort", abortUpload);
      reject(new Error("S3 upload failed"));
    };
    request.onabort = () => {
      signal?.removeEventListener("abort", abortUpload);
      reject(new DOMException("Загрузка отменена.", "AbortError"));
    };
    request.send(blob);
  });
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      if (item !== undefined) {
        await worker(item);
      }
    }
  });

  await Promise.all(workers);
}

async function uploadLessonFileDirect({
  file,
  purpose,
  kind,
  progressBase,
  progressSpan,
  onProgress,
  signal
}: {
  file: File | NamedBlobUpload;
  purpose: "media" | "thumbnail";
  kind?: ContentKind;
  progressBase: number;
  progressSpan: number;
  onProgress?: (progress: { percent: number; loadedBytes: number; speedBytesPerSecond: number }) => void;
  signal?: AbortSignal;
}): Promise<AdminLearningUploadedObject> {
  throwIfUploadCancelled(signal);
  const parts = getUploadParts(file);
  const startedAt = Date.now();
  const upload = await createAdminLearningMultipartUpload({
    purpose,
    kind,
    fileName: parts.name,
    contentType: parts.contentType,
    sizeBytes: parts.sizeBytes
  });
  throwIfUploadCancelled(signal);
  const loadedByPart = new Map<number, number>();
  const completedParts: Array<{ partNumber: number; etag: string }> = [];
  const chunks = upload.parts.map((part) => {
    const start = (part.partNumber - 1) * upload.partSizeBytes;
    const end = Math.min(start + upload.partSizeBytes, parts.blob.size);

    return {
      ...part,
      blob: parts.blob.slice(start, end)
    };
  });

  await runWithConcurrency(chunks, 4, async (part) => {
    throwIfUploadCancelled(signal);
    const etag = await putDirectLearningUploadPart(part.uploadUrl, part.blob, (loadedBytes) => {
      loadedByPart.set(part.partNumber, loadedBytes);
      const loadedTotal = Array.from(loadedByPart.values()).reduce((sum, value) => sum + value, 0);
      const percent = parts.sizeBytes > 0 ? Math.min(99, Math.max(1, Math.round((loadedTotal / parts.sizeBytes) * 100))) : 1;
      const combinedPercent = Math.min(99, Math.round(progressBase + (percent / 100) * progressSpan));
      const elapsedSeconds = Math.max(0.5, (Date.now() - startedAt) / 1000);
      lessonUploadProgress.value = combinedPercent;
      onProgress?.({
        percent: combinedPercent,
        loadedBytes: loadedTotal,
        speedBytesPerSecond: loadedTotal / elapsedSeconds
      });
    }, signal);
    throwIfUploadCancelled(signal);
    completedParts.push({ partNumber: part.partNumber, etag });
  });

  throwIfUploadCancelled(signal);
  const completed = await completeAdminLearningMultipartUpload({
    objectKey: upload.objectKey,
    uploadId: upload.uploadId,
    contentType: upload.contentType,
    sizeBytes: upload.sizeBytes,
    parts: completedParts
  });
  lessonUploadProgress.value = Math.min(100, Math.round(progressBase + progressSpan));
  onProgress?.({
    percent: Math.min(100, Math.round(progressBase + progressSpan)),
    loadedBytes: parts.sizeBytes,
    speedBytesPerSecond: parts.sizeBytes / Math.max(0.5, (Date.now() - startedAt) / 1000)
  });

  return completed;
}

function buildLessonForm() {
  const form = new FormData();
  form.set("categoryId", selectedLessonModule.value?.id ?? "");
  form.set("kind", lessonKind.value);
  form.set("title", trimmedLessonTitle.value);
  form.set("summary", lessonDescription.value.trim());
  form.set("body", lessonContent.value.trim());
  form.set("cardLayout", selectedModuleLessonLayout.value);
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

function buildLessonDirectPayloadFromDraft(
  draft: {
    categoryId: string;
    kind: ContentKind;
    title: string;
    summary: string;
    body: string;
    mediaSource: MediaInputSource;
    externalUrl: string;
    materials?: LessonMaterialDraft[];
    cardLayout: ContentCardLayout;
    removeThumbnail: boolean;
  },
  mediaObject?: AdminLearningUploadedObject | null,
  thumbnailObject?: AdminLearningUploadedObject | null,
  materialObjects: Map<string, AdminLearningUploadedObject> = new Map()
) {
  return {
    categoryId: draft.categoryId,
    kind: draft.kind,
    title: draft.title,
    summary: draft.summary,
    body: draft.body,
    materials: (draft.materials ?? []).map((material) => ({
      ...(material.existingMediaUrl ? { id: material.id } : {}),
      kind: material.kind,
      title: material.title.trim(),
      description: material.description.trim(),
      body: material.body.trim(),
      mediaUrl: getNormalizedExternalUrl(material.mediaSource, material.externalUrl),
      mediaObject: materialObjects.get(material.id) ?? null
    })),
    cardLayout: draft.cardLayout,
    isPublished: true,
    mediaUrl: getNormalizedExternalUrl(draft.mediaSource, draft.externalUrl),
    ...(mediaObject !== undefined ? { mediaObject } : {}),
    ...(thumbnailObject !== undefined ? { thumbnailObject } : {}),
    removeThumbnail: draft.removeThumbnail
  };
}

async function startBackgroundLessonUpload() {
  const module = selectedLessonModule.value;
  if (!module) {
    showLessonError("Модуль не найден.");
    return;
  }

  const draft = {
    id: `lesson-upload-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    lessonId: selectedLessonItem.value?.isPersisted ? selectedLessonItem.value.id : null,
    categoryId: module.id,
    kind: lessonKind.value,
    title: trimmedLessonTitle.value,
    summary: lessonDescription.value.trim(),
    body: lessonContent.value.trim(),
    mediaSource: lessonMediaSource.value,
    externalUrl: lessonExternalUrl.value.trim(),
    cardLayout: selectedModuleLessonLayout.value,
    removeThumbnail: shouldRemoveLessonThumbnail.value,
    mediaFile: lessonFile.value,
    thumbnailFile: lessonThumbnailFile.value,
    materials: lessonMaterialDrafts.value.map((material) => ({ ...material }))
  };
  const hasMedia = Boolean(draft.mediaFile);
  const hasThumbnail = Boolean(draft.thumbnailFile);
  const materialFiles = draft.materials.filter((material) => material.kind !== "text" && material.file);
  const totalParts = Number(hasMedia) + Number(hasThumbnail) + materialFiles.length;
  const mediaSizeBytes = draft.mediaFile ? getUploadParts(draft.mediaFile).sizeBytes : 0;
  const thumbnailSizeBytes = draft.thumbnailFile ? getUploadParts(draft.thumbnailFile).sizeBytes : 0;
  const materialSizeBytes = materialFiles.reduce((sum, material) => sum + (material.file ? getUploadParts(material.file).sizeBytes : 0), 0);
  const totalSizeBytes = mediaSizeBytes + thumbnailSizeBytes + materialSizeBytes;
  const abortController = new AbortController();
  const task = {
    id: draft.id,
    title: draft.title,
    status: "uploading",
    progress: 0,
    detail: "Загрузка",
    loadedBytes: 0,
    totalBytes: totalSizeBytes,
    speedBytesPerSecond: 0,
    startedAt: Date.now(),
    abortController
  } as const;
  let completedParts = 0;
  let completedBytes = 0;

  lessonUploads.add(task);
  closeLessonModal();

  try {
    let mediaObject: AdminLearningUploadedObject | null = null;
    let thumbnailObject: AdminLearningUploadedObject | null = null;
    const materialObjects = new Map<string, AdminLearningUploadedObject>();

    if (draft.mediaFile) {
      mediaObject = await uploadLessonFileDirect({
        file: draft.mediaFile,
        purpose: "media",
        kind: draft.kind,
        progressBase: (completedParts / totalParts) * 90,
        progressSpan: 90 / totalParts,
        signal: abortController.signal,
        onProgress: (progress) =>
          lessonUploads.update(draft.id, {
            progress: progress.percent,
            detail: "Загрузка",
            loadedBytes: completedBytes + progress.loadedBytes,
            speedBytesPerSecond: progress.speedBytesPerSecond
          })
      });
      completedParts += 1;
      completedBytes += mediaSizeBytes;
    }

    for (const material of materialFiles) {
      if (!material.file) {
        continue;
      }

      const materialSize = getUploadParts(material.file).sizeBytes;
      const materialObject = await uploadLessonFileDirect({
        file: material.file,
        purpose: "media",
        kind: material.kind,
        progressBase: (completedParts / totalParts) * 90,
        progressSpan: 90 / totalParts,
        signal: abortController.signal,
        onProgress: (progress) =>
          lessonUploads.update(draft.id, {
            progress: progress.percent,
            detail: "Загрузка материала",
            loadedBytes: completedBytes + progress.loadedBytes,
            speedBytesPerSecond: progress.speedBytesPerSecond
          })
      });
      materialObjects.set(material.id, materialObject);
      completedParts += 1;
      completedBytes += materialSize;
    }

    if (draft.thumbnailFile) {
      thumbnailObject = await uploadLessonFileDirect({
        file: draft.thumbnailFile,
        purpose: "thumbnail",
        progressBase: (completedParts / totalParts) * 90,
        progressSpan: 90 / totalParts,
        signal: abortController.signal,
        onProgress: (progress) =>
          lessonUploads.update(draft.id, {
            progress: progress.percent,
            detail: "Загрузка обложки",
            loadedBytes: completedBytes + progress.loadedBytes,
            speedBytesPerSecond: progress.speedBytesPerSecond
          })
      });
    }

    throwIfUploadCancelled(abortController.signal);
    lessonUploads.update(draft.id, { status: "saving", progress: 95, detail: "Сохраняем карточку урока", loadedBytes: totalSizeBytes });
    const payload = buildLessonDirectPayloadFromDraft(draft, mediaObject, thumbnailObject, materialObjects);
    throwIfUploadCancelled(abortController.signal);
    const response = draft.lessonId
      ? await updateAdminLearningMaterialDirect(draft.lessonId, payload)
      : await createAdminLearningMaterialDirect(payload);
    throwIfUploadCancelled(abortController.signal);

    if (draft.lessonId) {
      replaceMaterialInModule(response.material);
    } else {
      addMaterialToModule(response.material);
    }

    lessonUploads.update(draft.id, { status: "done", progress: 100, detail: "Урок сохранён" });
    window.setTimeout(() => lessonUploads.remove(draft.id), 5000);
  } catch (error) {
    if (isUploadCancelled(error)) {
      lessonUploads.remove(draft.id);
      return;
    }

    lessonUploads.update(draft.id, {
      status: "error",
      detail: error instanceof Error && error.message ? error.message : "Не удалось сохранить урок.",
      progress: 100
    });
  } finally {
    lessonUploadProgress.value = null;
  }
}

async function saveModule() {
  if (!trimmedModuleTitle.value) {
    showModuleError("Введите название модуля.");
    return;
  }

  if (!modulesLoadedFromApi.value) {
    if (editingModule.value) {
      editingModule.value.title = trimmedModuleTitle.value;
      editingModule.value.description = moduleDescription.value.trim();
      editingModule.value.defaultCardLayout = moduleDefaultCardLayout.value;
      closeModuleModal();
      return;
    }

    const moduleId = `custom-module-${Date.now()}`;
    moduleCards.value.push({
      id: moduleId,
      title: trimmedModuleTitle.value,
      description: moduleDescription.value.trim() || "Новый модуль. Уроки можно будет добавить следующим шагом.",
      defaultCardLayout: moduleDefaultCardLayout.value,
      meta: "Добавлено сегодня",
      isPersisted: false,
      images: []
    });
    collapseModule(moduleId);
    closeModuleModal();
    return;
  }

  isSaving.value = true;
  clearModuleError();

  try {
    if (editingModule.value) {
      const response = await updateAdminLearningCategory(editingModule.value.id, {
        title: trimmedModuleTitle.value,
        description: moduleDescription.value.trim() || null,
        defaultCardLayout: moduleDefaultCardLayout.value
      });
      updateModuleInList(response.category);
      closeModuleModal();
      return;
    }

    const response = await createAdminLearningCategory({
      title: trimmedModuleTitle.value,
      description: moduleDescription.value.trim() || "Новый модуль. Уроки можно будет добавить следующим шагом.",
      defaultCardLayout: moduleDefaultCardLayout.value
    });
    moduleCards.value = [
      ...moduleCards.value,
      {
        id: response.category.id,
        title: response.category.title,
        description: response.category.description ?? "Новый модуль. Уроки можно будет добавить следующим шагом.",
        defaultCardLayout: response.category.defaultCardLayout,
        meta: "Добавлено сегодня",
        isPersisted: true,
        images: []
      }
    ];
    collapseModule(response.category.id);
    closeModuleModal();
  } catch {
    showModuleError("Не удалось сохранить модуль.");
  } finally {
    isSaving.value = false;
  }
}

async function deleteModule() {
  if (!editingModule.value || !canManageModules.value) {
    return;
  }

  const module = editingModule.value;
  const confirmed = window.confirm(`Удалить модуль "${module.title}" вместе с уроками?`);
  if (!confirmed) {
    return;
  }

  isSaving.value = true;
  clearModuleError();

  try {
    if (module.isPersisted && modulesLoadedFromApi.value) {
      await deleteAdminLearningCategory(module.id);
    }
    moduleCards.value = moduleCards.value.filter((item) => item.id !== module.id);
    collapsedModuleIds.value = collapsedModuleIds.value.filter((id) => id !== module.id);
    closeModuleModal();
  } catch {
    showModuleError("Не удалось удалить модуль.");
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
    mediaUrl: getNormalizedExternalUrl(lessonMediaSource.value, lessonExternalUrl.value),
    mediaSource: lessonMediaSource.value === "file" ? null : "external",
    thumbnailUrl: shouldRemoveLessonThumbnail.value ? null : (selectedLessonItem.value?.thumbnailUrl ?? null),
    materials: lessonMaterialDrafts.value.map((material) => ({
      id: material.id,
      kind: material.kind,
      title: material.title.trim() || "Материал",
      description: material.description.trim() || null,
      body: material.body.trim() || null,
      mediaUrl: material.mediaSource === "file" ? material.existingMediaUrl : getNormalizedExternalUrl(material.mediaSource, material.externalUrl),
      mediaSource: material.mediaSource === "file" ? material.existingMediaUrl ? "s3" : null : "external",
      mediaContentType: material.existingMediaContentType,
      mediaSizeBytes: material.existingMediaSizeBytes
    })),
    cardLayout: selectedModuleLessonLayout.value,
    isPersisted: false,
    archivedUntil: null
  };

  if (selectedLessonItem.value) {
    Object.assign(selectedLessonItem.value, lessonData);
    return;
  }

  selectedLessonModule.value?.images.push(lessonData);
}

async function saveLesson() {
  if (!selectedLessonModule.value) {
    showLessonError("Модуль не найден.");
    return;
  }

  if (!trimmedLessonTitle.value) {
    showLessonError("Введите название урока.");
    return;
  }

  const draftError = getMaterialDraftError({
    title: lessonTitle.value,
    kind: lessonKind.value,
    isEditing: Boolean(selectedLessonItem.value?.isPersisted),
    currentKind: selectedLessonItem.value?.kind ?? null,
    currentMediaUrl:
      lessonMediaSource.value === "file" && selectedLessonItem.value?.mediaSource === "external"
        ? null
        : selectedLessonItem.value?.mediaUrl ?? null,
    hasMediaFile: Boolean(lessonFile.value),
    externalMediaUrl: lessonExternalUrl.value,
    mediaSource: lessonMediaSource.value,
    isVoiceRecording: isVoiceRecording.value,
    isVoiceProcessing: false
  });

  if (draftError) {
    showLessonError(draftError);
    return;
  }

  for (const material of lessonMaterialDrafts.value) {
    if (!material.title.trim()) {
      showLessonError("Заполните название каждого дополнительного материала.");
      return;
    }

    const materialError = getMaterialDraftError({
      title: material.title,
      kind: material.kind,
      isEditing: Boolean(material.existingMediaUrl),
      currentKind: material.existingKind,
      currentMediaUrl: material.mediaSource === "file" && material.existingMediaSource === "external" ? null : material.existingMediaUrl,
      hasMediaFile: Boolean(material.file),
      externalMediaUrl: material.externalUrl,
      mediaSource: material.mediaSource,
      isVoiceRecording: false,
      isVoiceProcessing: false
    });

    if (materialError) {
      showLessonError(materialError);
      return;
    }
  }

  if (!modulesLoadedFromApi.value) {
    saveLessonLocally();
    closeLessonModal();
    return;
  }

  const hasAdditionalMaterialFiles = lessonMaterialDrafts.value.some((material) => Boolean(material.file));
  const hasExternalLessonMedia = lessonKind.value !== "text" && lessonMediaSource.value !== "file";
  const hasExternalMaterialMedia = lessonMaterialDrafts.value.some((material) => material.kind !== "text" && material.mediaSource !== "file");
  const shouldUseDirectLessonPayload = Boolean(
    lessonFile.value ||
      lessonThumbnailFile.value ||
      hasAdditionalMaterialFiles ||
      hasExternalLessonMedia ||
      hasExternalMaterialMedia ||
      lessonMaterialDrafts.value.length ||
      selectedLessonItem.value?.materials.length
  );

  if (lessonFile.value || lessonThumbnailFile.value || hasAdditionalMaterialFiles) {
    await startBackgroundLessonUpload();
    return;
  }

  isSaving.value = true;
  lessonUploadProgress.value = null;
  clearLessonError();

  try {
    if (shouldUseDirectLessonPayload) {
      const payload = buildLessonDirectPayloadFromDraft({
        categoryId: selectedLessonModule.value.id,
        kind: lessonKind.value,
        title: trimmedLessonTitle.value,
        summary: lessonDescription.value.trim(),
        body: lessonContent.value.trim(),
        mediaSource: lessonMediaSource.value,
        externalUrl: lessonExternalUrl.value.trim(),
        materials: lessonMaterialDrafts.value.map((material) => ({ ...material })),
        cardLayout: selectedModuleLessonLayout.value,
        removeThumbnail: shouldRemoveLessonThumbnail.value
      });
      const response = selectedLessonItem.value?.isPersisted
        ? await updateAdminLearningMaterialDirect(selectedLessonItem.value.id, payload)
        : await createAdminLearningMaterialDirect(payload);

      if (selectedLessonItem.value?.isPersisted) {
        replaceMaterialInModule(response.material);
      } else {
        addMaterialToModule(response.material);
      }
      closeLessonModal();
      return;
    }

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
    showLessonError("Не удалось сохранить урок. Проверьте файл и настройки S3.");
  } finally {
    isSaving.value = false;
    lessonUploadProgress.value = null;
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
  clearLessonError();

  try {
    if (lesson.isPersisted && modulesLoadedFromApi.value) {
      await deleteAdminLearningMaterial(lesson.id);
    }

    removeLessonFromModule(moduleId, lesson.id);
    deletedLessons.value = [
      {
        ...lesson,
        categoryId: moduleId,
        archivedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      ...deletedLessons.value.filter((item) => item.id !== lesson.id)
    ];
    collapseModule(deletedContentModuleId);
    closeLessonModal();
  } catch {
    showLessonError("Не удалось удалить урок.");
  } finally {
    isSaving.value = false;
  }
}

function handleLessonFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  lessonFile.value = file;
  lessonFileName.value = file?.name ?? "";
  if (file) {
    lessonMediaSource.value = "file";
    lessonExternalUrl.value = "";
  }
}

function setLessonMediaSource(source: MediaInputSource) {
  lessonMediaSource.value = source;
  if (source !== "file") {
    lessonFile.value = null;
    lessonFileName.value = "";
    return;
  }

  lessonExternalUrl.value = "";
}

function setLessonKind(kind: ContentKind) {
  lessonKind.value = kind;
  if (kind === "text") {
    lessonFile.value = null;
    lessonFileName.value = "";
    lessonMediaSource.value = "file";
    lessonExternalUrl.value = "";
  } else if (kind !== "video" && lessonMediaSource.value === "youtube") {
    setLessonMediaSource("file");
  }
}

function addLessonMaterialDraft() {
  lessonMaterialDrafts.value = [...lessonMaterialDrafts.value, createLessonMaterialDraft()];
}

function removeLessonMaterialDraft(id: string) {
  lessonMaterialDrafts.value = lessonMaterialDrafts.value.filter((material) => material.id !== id);
}

function setLessonMaterialKind(material: LessonMaterialDraft, kind: ContentKind) {
  material.kind = kind;
  if (kind === "text") {
    material.file = null;
    material.fileName = "";
    material.mediaSource = "file";
    material.externalUrl = "";
    material.existingMediaUrl = null;
    material.existingMediaContentType = null;
    material.existingMediaSizeBytes = null;
  } else if (kind !== "video" && material.mediaSource === "youtube") {
    setLessonMaterialMediaSource(material, "file");
  }
}

function handleLessonMaterialFileChange(material: LessonMaterialDraft, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  material.file = file;
  material.fileName = file?.name ?? "";
  if (file) {
    material.mediaSource = "file";
    material.externalUrl = "";
  }
}

function setLessonMaterialMediaSource(material: LessonMaterialDraft, source: MediaInputSource) {
  material.mediaSource = source;
  if (source !== "file") {
    material.file = null;
    material.fileName = "";
    return;
  }

  material.externalUrl = "";
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
    showLessonError("Запись голоса недоступна в этом браузере.");
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
    clearLessonError();
  } catch {
    showLessonError("Не удалось начать запись голоса.");
  }
}

function stopVoiceRecording() {
  if (voiceRecorder.value && voiceRecorder.value.state !== "inactive") {
    voiceRecorder.value.stop();
  }
}

async function syncLearningTaskRoute() {
  if (!route) {
    return;
  }

  const path = route?.path ?? "/learning";

  if (path === "/learning") {
    if (showModuleModal.value) closeModuleModal();
    if (selectedLesson.value) closeLessonModal();
    return;
  }

  const isLessonViewPath = /^\/learning\/lessons\/[^/]+$/.test(path);
  if (!canManageModules.value && !isLessonViewPath) {
    closeLearningTask();
    return;
  }

  if (path === "/learning/modules/new") {
    if (!showModuleModal.value || editingModuleId.value) openModuleModal();
    return;
  }

  const moduleEditMatch = path.match(/^\/learning\/modules\/([^/]+)\/edit$/);
  if (moduleEditMatch) {
    const module = moduleCards.value.find((item) => item.id === decodeURIComponent(moduleEditMatch[1]!));
    if (module && editingModuleId.value !== module.id) openModuleEditModal(module);
    return;
  }

  const newLessonMatch = path.match(/^\/learning\/lessons\/new\/([^/]+)$/);
  if (newLessonMatch) {
    const module = moduleCards.value.find((item) => item.id === decodeURIComponent(newLessonMatch[1]!));
    if (module && (selectedLesson.value?.moduleId !== module.id || selectedLesson.value.lessonId !== null)) {
      openLessonCreateModal(module);
    }
    return;
  }

  const lessonMatch = path.match(/^\/learning\/lessons\/([^/]+)(?:\/edit)?$/);
  if (lessonMatch) {
    const lessonId = decodeURIComponent(lessonMatch[1]!);
    const module = moduleCards.value.find((item) => item.images.some((lesson) => lesson.id === lessonId));
    const lesson = module?.images.find((item) => item.id === lessonId);
    if (module && lesson && selectedLesson.value?.lessonId !== lesson.id) openLessonModal(module, lesson);
    return;
  }

  closeLearningTask();
}

onMounted(() => {
  void loadModules().then(syncLearningTaskRoute);
  document.addEventListener("visibilitychange", handleLearningVisibilityChange);
  window.addEventListener("pagehide", persistLessonVideoPlaybackBeforeExit);
  window.addEventListener("beforeunload", persistLessonVideoPlaybackBeforeExit);
});

onBeforeUnmount(() => {
  persistLessonVideoPlaybackBeforeExit();
  document.removeEventListener("visibilitychange", handleLearningVisibilityChange);
  window.removeEventListener("pagehide", persistLessonVideoPlaybackBeforeExit);
  window.removeEventListener("beforeunload", persistLessonVideoPlaybackBeforeExit);
  clearLessonVideoControlsTimer();
  clearLessonMaterialObserver();
});

watch(
  () => canManageModules.value,
  () => {
    void loadModules();
    void syncLearningTaskRoute();
  }
);

watch(
  () => route?.path ?? "/learning",
  () => void syncLearningTaskRoute()
);
</script>

<template>
  <section class="modules-section ui-page-section">
    <div class="section-head ui-page-header">
      <div>
        <h2 class="section-title">{{ t("modulesTitle") }}</h2>
        <p class="section-subtitle">{{ t("modulesSubtitle") }}</p>
      </div>
      <div v-if="canManageModules" class="modules-panel-actions" aria-label="Управление модулями">
        <button class="icon-button ui-icon-button" type="button" aria-label="Добавить модуль" @click="openModuleModal">
          <Plus class="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="modules-content">
    <p v-if="isLoadingModules" class="modules-edit-hint">{{ t("modulesLoading") }}</p>

    <button
      v-if="shouldShowContinueLesson && lastOpenedLesson && lastOpenedLessonModule"
      :class="continueLessonCardClasses"
      type="button"
      :aria-label="continueLessonButtonLabel"
      @click="openLastLesson"
    >
      <img :src="getContinueLessonImage(lastOpenedLessonModule, lastOpenedLesson)" :alt="continueLessonTitle" loading="lazy" />
      <span class="continue-lesson-copy">
        <strong>{{ continueLessonTitle }}</strong>
        <em>{{ continueLessonContext }}</em>
        <span class="continue-lesson-action">{{ continueLessonProgressLabel }}</span>
      </span>
    </button>

    <div class="admin-mockup-list">
      <article
        v-for="(module, moduleIndex) in moduleCards"
        :key="module.id"
      class="admin-mockup-card ui-card"
        :class="{ 'module-card-collapsed': isModuleCollapsed(module.id) }"
        :data-module-id="module.id"
      >
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
              <small v-if="module.description">{{ module.description }}</small>
            </span>
          </button>
          <button
            v-if="!isModuleCollapsed(module.id)"
            class="icon-button ui-icon-button module-open-collapse-control module-level-action"
            type="button"
            :aria-label="`Свернуть карточки ${module.title}`"
            @click="toggleModule(module.id)"
          >
            <ChevronUp class="h-4 w-4 module-collapse-icon-up" aria-hidden="true" />
          </button>
          <div
            class="admin-mockup-card-actions"
            :class="{
              'module-admin-actions': canManageModules,
              'module-member-actions': !canManageModules,
              'module-actions-expanded': !isModuleCollapsed(module.id)
            }"
          >
            <span>{{ lessonCountLabel(module.images.length) }}</span>
            <div v-if="canManageModules && isModuleCollapsed(module.id)" class="module-sort-controls module-level-sort-controls" aria-label="Сортировка модуля">
              <button
                class="icon-button ui-icon-button module-sort-button"
                type="button"
                :disabled="isSorting || moduleIndex === 0"
                aria-label="Поднять модуль"
                @click.stop="moveModuleOrder(module.id, 'up')"
              >
                <ArrowUp class="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                class="icon-button ui-icon-button module-sort-button"
                type="button"
                :disabled="isSorting || moduleIndex === moduleCards.length - 1"
                aria-label="Опустить модуль"
                @click.stop="moveModuleOrder(module.id, 'down')"
              >
                <ArrowDown class="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <button
              v-if="canManageModules && isModuleCollapsed(module.id)"
              class="icon-button ui-icon-button module-lesson-add module-level-action"
              type="button"
              :aria-label="`Редактировать ${module.title}`"
              @click="openModuleEditModal(module)"
            >
              <Pencil class="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              v-if="canManageModules && isModuleCollapsed(module.id)"
              class="icon-button ui-icon-button module-lesson-add module-level-action"
              type="button"
              :aria-label="`Добавить урок в ${module.title}`"
              @click="openLessonCreateModal(module)"
            >
              <Plus class="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              v-if="isModuleCollapsed(module.id)"
              class="icon-button ui-icon-button module-lesson-add module-collapse-control module-level-action"
              type="button"
              :aria-label="`Переключить ${module.title}`"
              @click="toggleModule(module.id)"
            >
              <ChevronDown class="h-4 w-4" :class="{ 'module-chevron-collapsed': isModuleCollapsed(module.id) }" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div v-if="!isModuleCollapsed(module.id)" class="admin-mockup-grid">
          <article
            v-for="(image, lessonIndex) in module.images"
            :key="image.id"
            class="module-lesson-sort-card"
            :class="module.defaultCardLayout === 'horizontal' ? 'module-lesson-sort-card-horizontal' : 'module-lesson-sort-card-vertical'"
            :data-module-id="module.id"
            :data-lesson-id="image.id"
          >
            <div
              v-if="canManageModules"
              class="module-sort-controls module-lesson-sort-controls lesson-level-sort-controls"
              :class="module.defaultCardLayout === 'horizontal' ? 'module-lesson-sort-controls-updown' : 'module-lesson-sort-controls-leftright'"
              aria-label="Сортировка урока"
            >
              <button
                class="icon-button ui-icon-button module-sort-button"
                type="button"
                :disabled="isSorting || lessonIndex === 0"
                :aria-label="module.defaultCardLayout === 'horizontal' ? 'Поднять урок' : 'Сдвинуть урок влево'"
                @click.stop="moveLessonOrder(module.id, image.id, 'up')"
              >
                <ArrowUp v-if="module.defaultCardLayout === 'horizontal'" class="h-3.5 w-3.5" aria-hidden="true" />
                <ArrowLeft v-else class="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                class="icon-button ui-icon-button module-sort-button"
                type="button"
                :disabled="isSorting || lessonIndex === module.images.length - 1"
                :aria-label="module.defaultCardLayout === 'horizontal' ? 'Опустить урок' : 'Сдвинуть урок вправо'"
                @click.stop="moveLessonOrder(module.id, image.id, 'down')"
              >
                <ArrowDown v-if="module.defaultCardLayout === 'horizontal'" class="h-3.5 w-3.5" aria-hidden="true" />
                <ArrowRight v-else class="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <button
              class="admin-mockup-thumb"
              :class="[
                module.defaultCardLayout === 'horizontal' ? 'admin-mockup-thumb-horizontal' : 'admin-mockup-thumb-vertical',
                isYouTubeLessonImage(image) ? 'admin-mockup-thumb-youtube' : ''
              ]"
              type="button"
              :aria-label="`Открыть урок ${image.title}`"
              @click="openLessonModal(module, image)"
            >
              <template v-if="module.defaultCardLayout === 'horizontal'">
                <span class="admin-mockup-thumb-label">
                  <strong>
                    {{ image.title }}
                    <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
                  </strong>
                </span>
                <img :src="getModuleLessonImage(module, image)" :alt="image.title" loading="lazy" />
              </template>
              <template v-else>
                <span class="admin-mockup-thumb-label">
                  {{ image.title }}
                  <ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <img :src="getModuleLessonImage(module, image)" :alt="image.title" loading="lazy" />
              </template>
            </button>
          </article>
        </div>
      </article>

      <article
        v-if="canManageModules && deletedLessons.length"
        class="admin-mockup-card ui-card admin-mockup-deleted-module"
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
              class="icon-button ui-icon-button module-lesson-add module-collapse-control"
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
                <small>{{ formatArchiveDeletionLabel(lesson.archivedUntil) }}</small>
              </div>
            </div>
            <button class="restore-lesson-button ui-button" type="button" :disabled="isSaving" :aria-label="`Восстановить ${lesson.title}`" @click="restoreDeletedLesson(lesson)">
              Восстановить
            </button>
          </article>
        </div>
      </article>
    </div>

    <TaskScreen
      v-if="showModuleModal && canManageModules"
      class="learning-task-screen"
      :title="moduleModalTitle"
      :subtitle="moduleModalDescription"
      portal
      @back="closeModuleModal"
    >
        <section class="module-name-modal ui-card modal-size-compact" role="dialog" aria-modal="true" :aria-label="moduleModalTitle">
          <header class="admin-client-modal-head">
            <div>
              <h3 id="module-modal-title">{{ moduleModalTitle }}</h3>
              <p>{{ moduleModalDescription }}</p>
            </div>
          </header>

          <div class="admin-form module-form">
            <label class="admin-field">
              <span>Название модуля</span>
              <input v-model="moduleTitle" class="text-input" type="text" placeholder="Например: Модуль 3" aria-label="Название модуля" />
            </label>
            <label class="admin-field">
              <span>Описание модуля</span>
              <textarea v-model="moduleDescription" class="text-input module-description-input" placeholder="Коротко о том, что внутри" aria-label="Описание модуля"></textarea>
            </label>
            <div class="admin-field">
              <span>Какие карточки создавать</span>
              <div class="lesson-layout-toggle" role="group" aria-label="Тип карточек модуля">
                <button
                  class="lesson-layout-option"
                  :class="{ 'lesson-layout-option-active': moduleDefaultCardLayout === 'vertical' }"
                  type="button"
                  aria-label="Вертикальные уроки"
                  @click="moduleDefaultCardLayout = 'vertical'"
                >
                  Вертикальные
                </button>
                <button
                  class="lesson-layout-option"
                  :class="{ 'lesson-layout-option-active': moduleDefaultCardLayout === 'horizontal' }"
                  type="button"
                  aria-label="Горизонтальные уроки"
                  @click="moduleDefaultCardLayout = 'horizontal'"
                >
                  Горизонтальные
                </button>
              </div>
            </div>

            <p v-if="moduleError" class="admin-error-text">{{ moduleError }}</p>
          </div>

          <div class="admin-form-actions">
            <button v-if="editingModule" class="secondary-button ui-button danger-action" type="button" :disabled="isSaving" @click="deleteModule">Удалить модуль</button>
            <button class="secondary-button ui-button" type="button" :disabled="isSaving" @click="closeModuleModal">Закрыть</button>
            <button class="primary-button ui-button" type="button" :disabled="isSaving" @click="saveModule">
              {{ isSaving ? "Сохраняем..." : "Сохранить модуль" }}
            </button>
          </div>
        </section>
    </TaskScreen>

    <TaskScreen
      v-if="selectedLesson && selectedLessonModule"
      class="learning-task-screen"
      :title="lessonModalTitle"
      :subtitle="lessonModalSubtitle"
      portal
      @back="closeLessonModal"
    >
        <section
          class="lesson-preview-modal ui-card"
          :class="canManageModules ? 'lesson-preview-modal-edit' : 'lesson-preview-modal-view'"
          role="dialog"
          aria-modal="true"
          :aria-label="lessonModalTitle"
        >
          <header class="admin-client-modal-head">
            <div>
              <span class="lesson-preview-kicker">Урок из модуля</span>
              <h3 id="lesson-preview-title">{{ lessonModalTitle }}</h3>
              <p>{{ lessonModalSubtitle }}</p>
            </div>
          </header>

          <div class="lesson-preview-scroll">
            <article v-if="!canManageModules && selectedLessonItem" class="lesson-viewer-content">
              <span class="lesson-preview-kicker">Содержимое урока</span>
              <p v-if="isLoadingLessonContent" class="lesson-viewer-empty">Загружаем содержимое урока...</p>
              <p v-else-if="lessonViewerError" class="lesson-viewer-empty">{{ lessonViewerError }}</p>

              <div
                v-if="selectedLessonItem.mediaUrl && getYouTubePlayerUrl(selectedLessonItem.mediaUrl)"
                class="lesson-youtube-player-shell"
              >
                <iframe
                  class="lesson-youtube-player"
                  :src="getYouTubePlayerUrl(selectedLessonItem.mediaUrl) ?? undefined"
                  :title="selectedLessonItem.title"
                  allow="fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowfullscreen
                  webkitallowfullscreen
                  mozallowfullscreen
                ></iframe>
              </div>
              <img
                v-else-if="selectedLessonItem.kind === 'photo' && selectedLessonItem.mediaUrl"
                class="lesson-viewer-media"
                :src="selectedLessonItem.mediaUrl"
                :alt="selectedLessonItem.title"
                loading="lazy"
              />
              <div
                v-else-if="selectedLessonItem.kind === 'video' && selectedLessonItem.mediaUrl"
                class="lesson-video-player"
                :class="{
                  'lesson-video-player-fullscreen': isLessonVideoFullscreen,
                  'lesson-video-player-controls-hidden': !showLessonVideoControls && isLessonVideoPlaying
                }"
                @mousemove="revealLessonVideoControls"
                @touchstart.passive="revealLessonVideoControls"
                @click="revealLessonVideoControls"
              >
                <video
                  ref="lessonVideoElement"
                  class="lesson-video-element"
                  :src="selectedLessonItem.mediaUrl"
                  :poster="lessonVideoPoster"
                  playsinline
                  preload="metadata"
                  @loadedmetadata="applyPendingLessonVideoStart"
                  @loadeddata="applyPendingLessonVideoStart"
                  @canplay="applyPendingLessonVideoStart"
                  @timeupdate="handleLessonVideoTimeUpdate"
                  @play="syncLessonVideoState"
                  @pause="persistLessonVideoPlayback(true)"
                  @ended="handleLessonVideoEnded"
                />
                <button
                  v-if="isLessonVideoFullscreen"
                  class="lesson-video-exit-fullscreen-button"
                  type="button"
                  aria-label="Выйти из полноэкранного видео"
                  @click.stop="toggleLessonVideoFullscreen"
                >
                  <X class="h-4 w-4" aria-hidden="true" />
                  <span>Закрыть</span>
                </button>
                <button
                  class="lesson-video-play-button"
                  type="button"
                  :aria-label="isLessonVideoPlaying ? 'Поставить видео на паузу' : 'Запустить видео'"
                  @click.stop="toggleLessonVideoPlayback"
                >
                  <Pause v-if="isLessonVideoPlaying" class="h-7 w-7" aria-hidden="true" />
                  <Play v-else class="h-7 w-7" aria-hidden="true" />
                </button>
                <div class="lesson-video-controls" :class="{ 'lesson-video-controls-hidden': !showLessonVideoControls && isLessonVideoPlaying }">
                  <span>{{ formatVideoTime(lessonVideoCurrentTime) }}</span>
                  <input
                    class="lesson-video-progress"
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    :value="lessonVideoProgress"
                    aria-label="Позиция видео"
                    @input.stop="handleLessonVideoSeek"
                  />
                  <span>{{ formatVideoTime(lessonVideoDuration) }}</span>
                  <button
                    class="lesson-video-fullscreen-button"
                    type="button"
                    :aria-label="isLessonVideoFullscreen ? 'Свернуть видео' : 'Открыть видео во весь экран'"
                    @click.stop="toggleLessonVideoFullscreen"
                  >
                    <Minimize2 v-if="isLessonVideoFullscreen" class="h-4 w-4" aria-hidden="true" />
                    <Maximize2 v-else class="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <audio
                v-else-if="selectedLessonItem.kind === 'audio' && selectedLessonItem.mediaUrl"
                ref="lessonVideoElement"
                class="lesson-viewer-audio"
                :src="selectedLessonItem.mediaUrl"
                controls
                preload="metadata"
                @loadedmetadata="applyPendingLessonVideoStart"
                @loadeddata="applyPendingLessonVideoStart"
                @canplay="applyPendingLessonVideoStart"
                @timeupdate="handleLessonVideoTimeUpdate"
                @pause="persistLessonVideoPlayback(true)"
                @seeked="persistLessonVideoPlayback(true)"
              />
              <p v-if="!isLoadingLessonContent && !lessonViewerError && selectedLessonItem.content">{{ selectedLessonItem.content }}</p>
              <p v-else-if="!isLoadingLessonContent && !lessonViewerError && !selectedLessonItem.mediaUrl" class="lesson-viewer-empty">
                Содержимое урока пока не добавлено.
              </p>

              <section v-if="selectedLessonItem.materials.length" class="lesson-material-list">
                <article
                  v-for="material in selectedLessonItem.materials"
                  :key="material.id"
                  class="lesson-material-card"
                  :data-lesson-material-id="material.id"
                >
                  <div>
                    <span>{{ contentKindOptions.find((option) => option.value === material.kind)?.label }}</span>
                    <strong>{{ material.title }}</strong>
                    <small v-if="material.description">{{ material.description }}</small>
                  </div>
                  <div
                    v-if="material.mediaUrl && getYouTubePlayerUrl(material.mediaUrl)"
                    class="lesson-youtube-player-shell"
                  >
                    <iframe
                      class="lesson-youtube-player lesson-youtube-player-material"
                      :src="getYouTubePlayerUrl(material.mediaUrl) ?? undefined"
                      :title="material.title"
                      allow="fullscreen; accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowfullscreen
                      webkitallowfullscreen
                      mozallowfullscreen
                    ></iframe>
                  </div>
                  <img v-else-if="material.kind === 'photo' && material.mediaUrl" :src="material.mediaUrl" :alt="material.title" loading="lazy" />
                  <video
                    v-else-if="material.kind === 'video' && material.mediaUrl"
                    :src="material.mediaUrl"
                    controls
                    playsinline
                    preload="metadata"
                    @loadedmetadata="applyPendingLessonMaterialStart(material, $event)"
                    @loadeddata="applyPendingLessonMaterialStart(material, $event)"
                    @canplay="applyPendingLessonMaterialStart(material, $event)"
                    @timeupdate="handleLessonMaterialTimeUpdate(material, $event)"
                    @pause="persistLessonMaterialPlayback(material, $event, true)"
                    @seeked="persistLessonMaterialPlayback(material, $event, true)"
                  />
                  <audio
                    v-else-if="material.kind === 'audio' && material.mediaUrl"
                    :src="material.mediaUrl"
                    controls
                    preload="metadata"
                    @loadedmetadata="applyPendingLessonMaterialStart(material, $event)"
                    @loadeddata="applyPendingLessonMaterialStart(material, $event)"
                    @canplay="applyPendingLessonMaterialStart(material, $event)"
                    @timeupdate="handleLessonMaterialTimeUpdate(material, $event)"
                    @pause="persistLessonMaterialPlayback(material, $event, true)"
                    @seeked="persistLessonMaterialPlayback(material, $event, true)"
                  />
                  <p v-if="material.body">{{ material.body }}</p>
                </article>
              </section>
            </article>

            <div v-if="canManageModules" class="admin-form lesson-editor-form">
              <div class="admin-field">
                <span>Вид карточки</span>
                <div class="lesson-layout-locked">
                  <strong>{{ selectedModuleLessonLayout === "horizontal" ? "Горизонтальная карточка" : "Вертикальная карточка" }}</strong>
                  <span>Формат карточек задан в настройках модуля.</span>
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
              <div class="admin-field">
                <span>Тип урока</span>
                <div class="lesson-kind-buttons" role="group" aria-label="Тип урока">
                  <button
                    v-for="option in contentKindOptions"
                    :key="option.value"
                    class="lesson-kind-button"
                    :class="{ 'lesson-kind-button-active': lessonKind === option.value }"
                    type="button"
                    @click="setLessonKind(option.value)"
                  >
                    <FileText v-if="option.value === 'text'" class="h-4 w-4" aria-hidden="true" />
                    <Image v-else-if="option.value === 'photo'" class="h-4 w-4" aria-hidden="true" />
                    <Video v-else-if="option.value === 'video'" class="h-4 w-4" aria-hidden="true" />
                    <Volume2 v-else class="h-4 w-4" aria-hidden="true" />
                    {{ option.label }}
                  </button>
                </div>
              </div>
              <div v-if="lessonKind !== 'text'" class="admin-field">
                <span>Источник контента</span>
                <div class="lesson-source-buttons" role="group" aria-label="Источник контента урока">
                  <button
                    v-for="option in getVisibleMediaInputSources(lessonKind)"
                    :key="option.value"
                    class="lesson-source-button"
                    :class="{ 'lesson-source-button-active': lessonMediaSource === option.value }"
                    type="button"
                    @click="setLessonMediaSource(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
              <label v-if="lessonKind !== 'text'" class="admin-field">
                <span>{{ lessonMediaSource === "file" ? "Файл урока" : lessonMediaSource === "youtube" ? "Ссылка YouTube" : "Ссылка на файл" }}</span>
                <input
                  v-if="lessonMediaSource === 'file'"
                  class="text-input"
                  type="file"
                  :accept="lessonKind === 'photo' ? 'image/*' : lessonKind === 'video' ? 'video/*' : 'audio/*'"
                  aria-label="Файл урока"
                  @change="handleLessonFileChange"
                />
                <input
                  v-else
                  v-model.trim="lessonExternalUrl"
                  class="text-input"
                  type="url"
                  :placeholder="lessonMediaSource === 'youtube' ? 'https://youtu.be/...' : 'https://cdn.example.com/file.mp4'"
                  :aria-label="lessonMediaSource === 'youtube' ? 'Ссылка YouTube' : 'Ссылка на файл урока'"
                />
                <small>{{ lessonMediaSource === "file" ? lessonFileName || "Файл не выбран" : "Файл в S3 загружаться не будет." }}</small>
              </label>
              <div v-if="lessonKind === 'audio'" class="voice-record-row">
                <button v-if="!isVoiceRecording" class="secondary-button ui-button" type="button" @click="startVoiceRecording">
                  <Mic class="h-4 w-4" aria-hidden="true" />
                  Записать голос
                </button>
                <button v-else class="secondary-button ui-button" type="button" @click="stopVoiceRecording">
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
                class="secondary-button ui-button cover-remove-button"
                type="button"
                @click="removeLessonThumbnail"
              >
                Удалить обложку
              </button>
              <label class="admin-field">
                <span>Содержимое урока</span>
                <textarea v-model="lessonContent" class="text-input lesson-content-input" placeholder="Текст урока или описание вложений" aria-label="Содержимое урока"></textarea>
              </label>

              <section class="lesson-extra-materials">
                <header>
                  <div>
                    <span>Дополнительные материалы</span>
                    <small>Текст, фото, видео или аудио внутри этого урока.</small>
                  </div>
                  <button class="secondary-button ui-button lesson-extra-add" type="button" @click="addLessonMaterialDraft">
                    <Plus class="h-4 w-4" aria-hidden="true" />
                    Добавить ещё материал
                  </button>
                </header>

                <article v-for="material in lessonMaterialDrafts" :key="material.id" class="lesson-extra-card">
                  <div class="lesson-extra-card-head">
                    <strong>Материал</strong>
                    <button class="icon-button ui-icon-button" type="button" aria-label="Удалить дополнительный материал" @click="removeLessonMaterialDraft(material.id)">
                      <Trash2 class="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div class="lesson-kind-buttons" role="group" aria-label="Тип дополнительного материала">
                    <button
                      v-for="option in contentKindOptions"
                      :key="option.value"
                      class="lesson-kind-button"
                      :class="{ 'lesson-kind-button-active': material.kind === option.value }"
                      type="button"
                      @click="setLessonMaterialKind(material, option.value)"
                    >
                      <FileText v-if="option.value === 'text'" class="h-4 w-4" aria-hidden="true" />
                      <Image v-else-if="option.value === 'photo'" class="h-4 w-4" aria-hidden="true" />
                      <Video v-else-if="option.value === 'video'" class="h-4 w-4" aria-hidden="true" />
                      <Volume2 v-else class="h-4 w-4" aria-hidden="true" />
                      {{ option.label }}
                    </button>
                  </div>

                  <label class="admin-field">
                    <span>Название материала</span>
                    <input v-model="material.title" class="text-input" type="text" placeholder="Например: Разбор задания" aria-label="Название дополнительного материала" />
                  </label>
                  <label class="admin-field">
                    <span>Описание</span>
                    <input v-model="material.description" class="text-input" type="text" placeholder="Короткое описание" aria-label="Описание дополнительного материала" />
                  </label>
                  <div v-if="material.kind !== 'text'" class="admin-field">
                    <span>Источник материала</span>
                    <div class="lesson-source-buttons" role="group" aria-label="Источник дополнительного материала">
                      <button
                        v-for="option in getVisibleMediaInputSources(material.kind)"
                        :key="option.value"
                        class="lesson-source-button"
                        :class="{ 'lesson-source-button-active': material.mediaSource === option.value }"
                        type="button"
                        @click="setLessonMaterialMediaSource(material, option.value)"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>
                  <label v-if="material.kind !== 'text'" class="admin-field">
                    <span>{{ material.mediaSource === "file" ? "Файл материала" : material.mediaSource === "youtube" ? "Ссылка YouTube" : "Ссылка на файл" }}</span>
                    <input
                      v-if="material.mediaSource === 'file'"
                      class="text-input"
                      type="file"
                      :accept="contentKindOptions.find((option) => option.value === material.kind)?.accept"
                      aria-label="Файл дополнительного материала"
                      @change="handleLessonMaterialFileChange(material, $event)"
                    />
                    <input
                      v-else
                      v-model.trim="material.externalUrl"
                      class="text-input"
                      type="url"
                      :placeholder="material.mediaSource === 'youtube' ? 'https://youtu.be/...' : 'https://cdn.example.com/file.mp4'"
                      :aria-label="material.mediaSource === 'youtube' ? 'Ссылка YouTube' : 'Ссылка на файл материала'"
                    />
                    <small>{{ material.mediaSource === "file" ? material.fileName || "Файл не выбран" : "Файл в S3 загружаться не будет." }}</small>
                  </label>
                  <label class="admin-field">
                    <span>Текст / заметка</span>
                    <textarea v-model="material.body" class="text-input lesson-extra-body" placeholder="Текст материала или комментарий к файлу" aria-label="Текст дополнительного материала"></textarea>
                  </label>
                </article>
              </section>
              <p v-if="lessonError" class="admin-error-text">{{ lessonError }}</p>
            </div>
          </div>

          <div v-if="canManageModules" class="admin-form-actions lesson-preview-actions lesson-preview-actions-edit">
            <button
              v-if="selectedLessonItem"
              class="secondary-button ui-button lesson-delete-button"
              type="button"
              :disabled="isSaving"
              @click="deleteLesson"
            >
              <Trash2 class="h-4 w-4" aria-hidden="true" />
              Удалить урок
            </button>
            <button class="secondary-button ui-button" type="button" :disabled="isSaving" @click="closeLessonModal">Закрыть</button>
            <button v-if="canManageModules" class="primary-button ui-button" type="button" :disabled="isSaving" @click="saveLesson">
              {{ isSaving ? "Сохраняем..." : "Сохранить урок" }}
            </button>
          </div>
        </section>
    </TaskScreen>
    </div>
  </section>
</template>
