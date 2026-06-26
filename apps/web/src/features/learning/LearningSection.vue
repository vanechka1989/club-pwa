<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Mic,
  Music2,
  Pencil,
  Play,
  Plus,
  Square,
  X
} from "lucide-vue-next";
import type { AdminLearningMaterial, ContentKind, LearningCategory, LearningContent } from "@club/shared";
import {
  completeLearningContent,
  createAdminLearningCategory,
  createAdminLearningMaterial,
  getAdminLearning,
  getLearningContent,
  getLearningHome,
  saveLearningPlayback,
  updateAdminLearningCategory,
  updateAdminLearningMaterial
} from "@/api/client";
import { useSessionStore } from "@/stores/session";
import { createVoiceUpload } from "./voiceUpload";
import { formatLearningPlaybackLabel, getLearningKindLabel } from "./learningPresentation";

type LessonItem = (LearningContent | AdminLearningMaterial) & {
  isPublished?: boolean;
  archivedUntil?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

type ModuleCard = LearningCategory & {
  lessons: LessonItem[];
};

type LessonFormState = {
  categoryId: string;
  kind: ContentKind;
  title: string;
  summary: string;
  body: string;
  isPublished: boolean;
};

const session = useSessionStore();
const learningCategories = ref<LearningCategory[]>([]);
const learningLessons = ref<LessonItem[]>([]);
const learningLoading = ref(false);
const learningError = ref("");
const learningNotice = ref("");

const showModuleModal = ref(false);
const moduleEditMode = ref(false);
const editingModuleId = ref<string | null>(null);
const moduleTitle = ref("");
const moduleError = ref("");

const showLessonModal = ref(false);
const editingLessonId = ref<string | null>(null);
const lessonError = ref("");
const lessonSaving = ref(false);
const lessonFile = ref<File | null>(null);
const lessonThumbnailFile = ref<File | null>(null);
const voicePreviewUrl = ref<string | null>(null);
const voiceRecording = ref(false);
const voiceProcessing = ref(false);
const voiceError = ref("");

const showLessonViewer = ref(false);
const viewerLoading = ref(false);
const viewerError = ref("");
const selectedLesson = ref<LearningContent | null>(null);
const selectedLessonCompletedAt = ref<string | null>(null);
const selectedLessonPlaybackSeconds = ref(0);
const playbackElement = ref<HTMLMediaElement | null>(null);
const lastSavedPlaybackSecond = ref(0);

let voiceRecorder: MediaRecorder | null = null;
let voiceStream: MediaStream | null = null;
let voiceChunks: Blob[] = [];

const lessonForm = reactive<LessonFormState>({
  categoryId: "",
  kind: "text",
  title: "",
  summary: "",
  body: "",
  isPublished: true
});

const canManageModules = computed(() => session.user?.role === "admin" || session.user?.role === "owner");
const editingModule = computed(() => learningCategories.value.find((module) => module.id === editingModuleId.value) ?? null);
const editingLesson = computed(() => learningLessons.value.find((lesson) => lesson.id === editingLessonId.value) ?? null);
const moduleModalTitle = computed(() => (editingModule.value ? "Редактировать модуль" : "Новый модуль"));
const moduleModalDescription = computed(() => (editingModule.value ? "Измените название выбранного модуля." : "Для модуля нужно только название."));
const trimmedModuleTitle = computed(() => moduleTitle.value.trim());
const lessonModalTitle = computed(() => (editingLesson.value ? "Редактировать урок" : "Новый урок"));
const lessonModalDescription = computed(() =>
  editingLesson.value ? "Измените данные урока или замените медиафайл." : "Добавьте урок внутрь выбранного модуля."
);

const moduleCards = computed<ModuleCard[]>(() =>
  learningCategories.value.map((module) => ({
    ...module,
    lessons: learningLessons.value.filter((lesson) => lesson.categoryId === module.id && !lesson.archivedUntil)
  }))
);

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

function lessonIcon(kind: ContentKind) {
  if (kind === "photo") {
    return ImageIcon;
  }

  if (kind === "video") {
    return Play;
  }

  if (kind === "audio") {
    return Music2;
  }

  return FileText;
}

function lessonThumbnailUrl(lesson: LessonItem | LearningContent) {
  if (lesson.thumbnailUrl) {
    return lesson.thumbnailUrl;
  }

  if (lesson.kind === "photo") {
    return lesson.mediaUrl;
  }

  return null;
}

function isAdminLesson(lesson: LessonItem): lesson is AdminLearningMaterial {
  return "isPublished" in lesson;
}

function updateLessonInList(lesson: AdminLearningMaterial) {
  const nextLessons = learningLessons.value.filter((item) => item.id !== lesson.id);
  learningLessons.value = [...nextLessons, lesson];
  learningCategories.value = learningCategories.value.map((category) =>
    category.id === lesson.categoryId
      ? {
          ...category,
          itemsCount: nextLessons.filter((item) => item.categoryId === category.id && !item.archivedUntil).length + 1
        }
      : category
  );
}

async function loadLearning() {
  learningLoading.value = true;
  learningError.value = "";

  try {
    if (canManageModules.value) {
      const response = await getAdminLearning();
      learningCategories.value = response.categories;
      learningLessons.value = response.materials;
      return;
    }

    const response = await getLearningHome();
    learningCategories.value = response.categories;
    learningLessons.value = response.featured;
  } catch {
    learningError.value = canManageModules.value
      ? "Не удалось загрузить модули."
      : "Модули доступны после активации подписки.";
  } finally {
    learningLoading.value = false;
  }
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

async function saveModule() {
  if (!trimmedModuleTitle.value) {
    moduleError.value = "Введите название модуля.";
    return;
  }

  try {
    if (editingModule.value) {
      const response = await updateAdminLearningCategory(editingModule.value.id, {
        title: trimmedModuleTitle.value,
        description: editingModule.value.description
      });
      learningCategories.value = learningCategories.value.map((module) =>
        module.id === response.category.id ? response.category : module
      );
      learningNotice.value = "Модуль сохранён.";
      closeModuleModal();
      return;
    }

    const response = await createAdminLearningCategory({
      title: trimmedModuleTitle.value,
      description: "Модуль клуба. Внутри будут уроки и материалы."
    });
    learningCategories.value = [...learningCategories.value, response.category];
    learningNotice.value = "Модуль добавлен.";
    closeModuleModal();
  } catch {
    moduleError.value = "Не удалось сохранить модуль.";
  }
}

function resetLessonForm(moduleId = "") {
  editingLessonId.value = null;
  lessonForm.categoryId = moduleId || learningCategories.value[0]?.id || "";
  lessonForm.kind = "text";
  lessonForm.title = "";
  lessonForm.summary = "";
  lessonForm.body = "";
  lessonForm.isPublished = true;
  lessonError.value = "";
  lessonFile.value = null;
  lessonThumbnailFile.value = null;
  clearVoicePreview();
}

function openLessonCreateModal(module: ModuleCard) {
  resetLessonForm(module.id);
  showLessonModal.value = true;
}

function openLessonEditModal(lesson: LessonItem) {
  editingLessonId.value = lesson.id;
  lessonForm.categoryId = lesson.categoryId;
  lessonForm.kind = lesson.kind;
  lessonForm.title = lesson.title;
  lessonForm.summary = lesson.summary ?? "";
  lessonForm.body = lesson.body ?? "";
  lessonForm.isPublished = isAdminLesson(lesson) ? lesson.isPublished : true;
  lessonError.value = "";
  lessonFile.value = null;
  lessonThumbnailFile.value = null;
  clearVoicePreview();
  showLessonModal.value = true;
}

function closeLessonModal() {
  showLessonModal.value = false;
  resetLessonForm();
}

function handleLessonFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  lessonFile.value = input.files?.[0] ?? null;
  clearVoicePreview();
}

function handleLessonThumbnailChange(event: Event) {
  const input = event.target as HTMLInputElement;
  lessonThumbnailFile.value = input.files?.[0] ?? null;
}

function clearVoicePreview() {
  if (voicePreviewUrl.value) {
    URL.revokeObjectURL(voicePreviewUrl.value);
  }
  voicePreviewUrl.value = null;
}

function preferredRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  const variants = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "video/webm;codecs=opus"];
  return variants.find((item) => MediaRecorder.isTypeSupported(item)) ?? "";
}

async function startVoiceRecording() {
  voiceError.value = "";

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    voiceError.value = "Запись голоса недоступна в этом браузере.";
    return;
  }

  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = preferredRecorderMimeType();
    voiceRecorder = new MediaRecorder(voiceStream, mimeType ? { mimeType } : undefined);
    voiceChunks = [];
    voiceRecording.value = true;
    voiceProcessing.value = false;

    voiceRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        voiceChunks.push(event.data);
      }
    };
    voiceRecorder.onstop = () => {
      voiceProcessing.value = true;
      try {
        const upload = createVoiceUpload(voiceChunks, voiceRecorder?.mimeType);
        lessonFile.value = new File([upload.blob], upload.name, { type: upload.blob.type });
        clearVoicePreview();
        voicePreviewUrl.value = URL.createObjectURL(upload.blob);
        lessonForm.kind = "audio";
      } catch {
        voiceError.value = "Не удалось подготовить голосовое сообщение.";
      } finally {
        voiceProcessing.value = false;
        voiceRecording.value = false;
        stopVoiceTracks();
      }
    };
    voiceRecorder.start();
  } catch {
    voiceError.value = "Не удалось получить доступ к микрофону.";
    stopVoiceTracks();
  }
}

function stopVoiceTracks() {
  voiceStream?.getTracks().forEach((track) => track.stop());
  voiceStream = null;
}

function stopVoiceRecording() {
  if (!voiceRecorder || voiceRecorder.state === "inactive") {
    return;
  }

  voiceRecorder.stop();
}

function validateLessonForm() {
  if (!lessonForm.categoryId) {
    return "Выберите модуль.";
  }

  if (!lessonForm.title.trim()) {
    return "Введите название урока.";
  }

  if (voiceRecording.value) {
    return "Остановите запись голоса перед сохранением.";
  }

  if (voiceProcessing.value) {
    return "Дождитесь подготовки голосового сообщения.";
  }

  const requiresMedia =
    lessonForm.kind !== "text" &&
    (!editingLesson.value || editingLesson.value.kind !== lessonForm.kind || !editingLesson.value.mediaUrl);

  if (requiresMedia && !lessonFile.value) {
    if (lessonForm.kind === "audio") {
      return "Запишите голосовое сообщение или выберите аудиофайл.";
    }

    if (lessonForm.kind === "photo") {
      return "Выберите фото для урока.";
    }

    return "Выберите видео для урока.";
  }

  return null;
}

async function saveLesson() {
  const error = validateLessonForm();
  if (error) {
    lessonError.value = error;
    return;
  }

  lessonSaving.value = true;
  lessonError.value = "";

  const form = new FormData();
  form.set("categoryId", lessonForm.categoryId);
  form.set("kind", lessonForm.kind);
  form.set("title", lessonForm.title.trim());
  form.set("summary", lessonForm.summary.trim());
  form.set("body", lessonForm.body.trim());
  form.set("isPublished", String(lessonForm.isPublished));

  if (lessonFile.value) {
    form.set("file", lessonFile.value, lessonFile.value.name);
  }

  if (lessonThumbnailFile.value) {
    form.set("thumbnailFile", lessonThumbnailFile.value, lessonThumbnailFile.value.name);
  }

  try {
    const response = editingLesson.value
      ? await updateAdminLearningMaterial(editingLesson.value.id, form)
      : await createAdminLearningMaterial(form);
    updateLessonInList(response.material);
    learningNotice.value = editingLesson.value ? "Урок сохранён." : "Урок добавлен.";
    closeLessonModal();
  } catch {
    lessonError.value = "Не удалось сохранить урок. Проверьте тип файла и S3-настройки.";
  } finally {
    lessonSaving.value = false;
  }
}

async function openLesson(lesson: LessonItem) {
  if (moduleEditMode.value) {
    return;
  }

  if (canManageModules.value) {
    openLessonEditModal(lesson);
    return;
  }

  viewerLoading.value = true;
  viewerError.value = "";
  showLessonViewer.value = true;

  try {
    const response = await getLearningContent(lesson.id);
    selectedLesson.value = response.item;
    selectedLessonCompletedAt.value = response.completedAt;
    selectedLessonPlaybackSeconds.value = response.playbackPositionSeconds;
    lastSavedPlaybackSecond.value = response.playbackPositionSeconds;
    await nextTick();
    if (playbackElement.value && response.playbackPositionSeconds > 0) {
      playbackElement.value.currentTime = response.playbackPositionSeconds;
    }
  } catch {
    viewerError.value = "Не удалось открыть урок.";
  } finally {
    viewerLoading.value = false;
  }
}

function closeLessonViewer() {
  showLessonViewer.value = false;
  selectedLesson.value = null;
  selectedLessonCompletedAt.value = null;
  selectedLessonPlaybackSeconds.value = 0;
  viewerError.value = "";
}

async function handlePlaybackTimeUpdate(event: Event) {
  const media = event.target as HTMLMediaElement;
  const currentSecond = Math.floor(media.currentTime);
  if (!selectedLesson.value || currentSecond < 1 || Math.abs(currentSecond - lastSavedPlaybackSecond.value) < 8) {
    return;
  }

  lastSavedPlaybackSecond.value = currentSecond;
  await saveLearningPlayback(selectedLesson.value.id, currentSecond).catch(() => null);
}

async function markSelectedLessonCompleted() {
  if (!selectedLesson.value) {
    return;
  }

  const response = await completeLearningContent(selectedLesson.value.id).catch(() => null);
  if (response?.ok) {
    selectedLessonCompletedAt.value = response.completedAt ?? new Date().toISOString();
    learningNotice.value = "Урок отмечен пройденным.";
  }
}

onMounted(() => {
  void loadLearning();
});

watch(canManageModules, () => {
  void loadLearning();
});

onBeforeUnmount(() => {
  clearVoicePreview();
  stopVoiceTracks();
});
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

    <p v-if="learningNotice" class="admin-success-text">{{ learningNotice }}</p>
    <p v-if="learningError" class="admin-error-text">{{ learningError }}</p>
    <p v-if="learningLoading" class="admin-empty">Загрузка модулей...</p>
    <p v-if="moduleEditMode && canManageModules" class="modules-edit-hint">Выберите модуль для редактирования.</p>

    <div v-if="moduleCards.length" class="admin-mockup-list">
      <article v-for="module in moduleCards" :key="module.id" class="admin-mockup-card" :class="{ 'module-edit-card': moduleEditMode }">
        <div class="admin-mockup-card-head">
          <div>
            <strong>{{ module.title }}</strong>
            <small>{{ module.description || "Модуль клуба" }}</small>
          </div>
          <div class="module-card-actions">
            <span>{{ lessonCountLabel(module.lessons.length) }}</span>
            <button
              v-if="canManageModules"
              class="icon-button module-lesson-add"
              type="button"
              :aria-label="`Добавить урок в ${module.title}`"
              @click="openLessonCreateModal(module)"
            >
              <Plus class="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <button
          v-if="moduleEditMode && canManageModules"
          class="module-edit-select"
          type="button"
          :aria-label="`Редактировать ${module.title}`"
          @click="openModuleEditModal(module)"
        >
          Выбрать этот модуль
        </button>

        <div v-if="module.lessons.length" class="admin-mockup-grid module-lessons-grid">
          <button
            v-for="lesson in module.lessons"
            :key="lesson.id"
            class="admin-mockup-thumb module-lesson-thumb"
            type="button"
            :aria-label="`${canManageModules ? 'Редактировать' : 'Открыть'} урок ${lesson.title}`"
            @click="openLesson(lesson)"
          >
            <span class="module-lesson-media">
              <img v-if="lessonThumbnailUrl(lesson)" :src="lessonThumbnailUrl(lesson) ?? undefined" :alt="lesson.title" loading="lazy" />
              <component :is="lessonIcon(lesson.kind)" v-else class="h-8 w-8" aria-hidden="true" />
            </span>
            <span>
              {{ lesson.title }}
              <Pencil v-if="canManageModules" class="h-3.5 w-3.5" aria-hidden="true" />
              <ExternalLink v-else class="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <small>{{ getLearningKindLabel(lesson.kind) }}</small>
            <em v-if="canManageModules && isAdminLesson(lesson) && !lesson.isPublished">Скрыт</em>
          </button>
        </div>
        <p v-else class="admin-empty module-empty">Уроков пока нет.</p>
      </article>
    </div>
    <p v-else-if="!learningLoading" class="admin-empty">Модулей пока нет. Добавьте первый модуль через плюс.</p>

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
          <button class="secondary-button" type="button" @click="closeModuleModal">Закрыть</button>
          <button class="primary-button" type="button" @click="saveModule">Сохранить модуль</button>
        </div>
      </aside>
    </div>

    <Teleport to="body">
      <div v-if="showLessonModal && canManageModules" class="admin-modal-backdrop" @click.self="closeLessonModal">
        <aside class="admin-detail admin-client-modal lesson-editor-modal" role="dialog" aria-modal="true" aria-labelledby="lesson-modal-title">
          <header class="admin-client-modal-head">
            <div>
              <h3 id="lesson-modal-title">{{ lessonModalTitle }}</h3>
              <p>{{ lessonModalDescription }}</p>
            </div>
            <button class="icon-button" type="button" :aria-label="`Закрыть окно: ${lessonModalTitle}`" @click="closeLessonModal">
              <X class="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <form class="admin-form lesson-editor-form" @submit.prevent="saveLesson">
            <label class="admin-field">
              <span>Модуль</span>
              <select v-model="lessonForm.categoryId" class="text-input">
                <option v-for="module in learningCategories" :key="module.id" :value="module.id">
                  {{ module.title }}
                </option>
              </select>
            </label>

            <label class="admin-field">
              <span>Тип урока</span>
              <select v-model="lessonForm.kind" class="text-input">
                <option value="text">Текст</option>
                <option value="photo">Фото</option>
                <option value="video">Видео</option>
                <option value="audio">Аудио / голосовое</option>
              </select>
            </label>

            <label class="admin-field">
              <span>Название урока</span>
              <input v-model.trim="lessonForm.title" class="text-input" placeholder="Название урока" />
            </label>

            <label class="admin-field">
              <span>Краткое описание</span>
              <input v-model.trim="lessonForm.summary" class="text-input" placeholder="Краткое описание" />
            </label>

            <label class="admin-field">
              <span>Текст урока</span>
              <textarea v-model.trim="lessonForm.body" class="text-input lesson-body-input" placeholder="Текст, ссылки или пояснение"></textarea>
            </label>

            <label v-if="lessonForm.kind !== 'text'" class="admin-field">
              <span>Файл урока</span>
              <input
                class="text-input"
                type="file"
                :accept="lessonForm.kind === 'photo' ? 'image/*' : lessonForm.kind === 'video' ? 'video/*' : 'audio/*,video/webm,video/mp4'"
                @change="handleLessonFileChange"
              />
              <small v-if="editingLesson?.mediaUrl && !lessonFile">Текущий файл сохранён. Выберите новый файл только если нужно заменить.</small>
            </label>

            <label v-if="lessonForm.kind === 'video'" class="admin-field">
              <span>Обложка видео</span>
              <input class="text-input" type="file" accept="image/*" @change="handleLessonThumbnailChange" />
              <small>Если обложку не загрузить, будет показана иконка видео.</small>
            </label>

            <div v-if="lessonForm.kind === 'audio'" class="voice-recorder-box">
              <div class="voice-recorder-actions">
                <button v-if="!voiceRecording" class="secondary-button" type="button" @click="startVoiceRecording">
                  <Mic class="h-4 w-4" aria-hidden="true" />
                  Записать голос
                </button>
                <button v-else class="secondary-button voice-stop-button" type="button" @click="stopVoiceRecording">
                  <Square class="h-4 w-4" aria-hidden="true" />
                  Остановить
                </button>
              </div>
              <audio v-if="voicePreviewUrl" :src="voicePreviewUrl" controls></audio>
              <p v-if="voiceError" class="admin-error-text">{{ voiceError }}</p>
            </div>

            <label class="admin-check-row">
              <input v-model="lessonForm.isPublished" type="checkbox" />
              <span>Сразу открыть клиентам</span>
            </label>

            <p v-if="lessonError" class="admin-error-text">{{ lessonError }}</p>

            <div class="admin-form-actions">
              <button class="secondary-button" type="button" @click="closeLessonModal">Закрыть</button>
              <button class="primary-button" type="submit" :disabled="lessonSaving">
                {{ editingLesson ? "Сохранить урок" : "Добавить урок" }}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showLessonViewer" class="admin-modal-backdrop" @click.self="closeLessonViewer">
        <aside class="admin-detail admin-client-modal lesson-viewer-modal" role="dialog" aria-modal="true" aria-labelledby="lesson-viewer-title">
          <header class="admin-client-modal-head">
            <div>
              <h3 id="lesson-viewer-title">{{ selectedLesson?.title || "Урок" }}</h3>
              <p v-if="selectedLesson">{{ getLearningKindLabel(selectedLesson.kind) }}</p>
            </div>
            <button class="icon-button" type="button" aria-label="Закрыть урок" @click="closeLessonViewer">
              <X class="h-5 w-5" aria-hidden="true" />
            </button>
          </header>

          <p v-if="viewerLoading" class="admin-empty">Открываем урок...</p>
          <p v-if="viewerError" class="admin-error-text">{{ viewerError }}</p>

          <article v-if="selectedLesson" class="lesson-viewer-content">
            <p v-if="selectedLesson.summary" class="lesson-summary">{{ selectedLesson.summary }}</p>
            <div v-if="selectedLesson.kind === 'photo' && selectedLesson.mediaUrl" class="lesson-media-frame">
              <img :src="selectedLesson.mediaUrl" :alt="selectedLesson.title" />
            </div>
            <div v-else-if="selectedLesson.kind === 'video' && selectedLesson.mediaUrl" class="lesson-media-frame">
              <video
                ref="playbackElement"
                :src="selectedLesson.mediaUrl"
                :poster="selectedLesson.thumbnailUrl ?? undefined"
                controls
                playsinline
                @timeupdate="handlePlaybackTimeUpdate"
              ></video>
            </div>
            <div v-else-if="selectedLesson.kind === 'audio' && selectedLesson.mediaUrl" class="lesson-media-frame lesson-audio-frame">
              <audio ref="playbackElement" :src="selectedLesson.mediaUrl" controls @timeupdate="handlePlaybackTimeUpdate"></audio>
              <small>{{ formatLearningPlaybackLabel(selectedLesson.kind, selectedLessonPlaybackSeconds) }}</small>
            </div>
            <div v-if="selectedLesson.body" class="lesson-body" v-html="selectedLesson.body"></div>

            <button class="primary-button" type="button" :disabled="Boolean(selectedLessonCompletedAt)" @click="markSelectedLessonCompleted">
              <CheckCircle2 class="h-4 w-4" aria-hidden="true" />
              {{ selectedLessonCompletedAt ? "Урок пройден" : "Отметить пройденным" }}
            </button>
          </article>
        </aside>
      </div>
    </Teleport>
  </section>
</template>
