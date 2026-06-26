<script setup lang="ts">
import type { AdminLearningMaterial, ContentKind, LearningContent, LearningCategory, LessonComment } from "@club/shared";
import { CheckCircle2, ExternalLink, Eye, EyeOff, Image, Loader2, Mic, Music, Pencil, Play, Plus, RotateCcw, Square, Trash2, Type, X } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  completeLearningContent,
  createAdminLearningCategory,
  createAdminLearningMaterial,
  createLessonComment,
  deleteAdminLearningCategory,
  deleteAdminLearningMaterial,
  getAdminLearning,
  getLearningContent,
  getLearningHome,
  getLessonComments,
  saveLearningPlayback,
  restoreAdminLearningMaterial,
  updateAdminLearningMaterial,
  updateAdminLearningCategoryStatus,
  updateAdminLearningMaterialStatus
} from "@/api/client";
import { formatMembershipStatus, useI18n } from "@/features/app/i18n";
import { useSessionStore } from "@/stores/session";
import { formatLearningPlaybackLabel, getLearningKindLabel } from "./learningPresentation";
import { getMaterialDraftError } from "./materialForm";
import { createVoiceUpload, type NamedBlobUpload } from "./voiceUpload";

const session = useSessionStore();
const { t } = useI18n();

const categories = ref<LearningCategory[]>([]);
const featured = ref<LearningContent[]>([]);
const adminMaterials = ref<AdminLearningMaterial[]>([]);
const lastOpenedItem = ref<LearningContent | null>(null);
const lastOpenedPlaybackPosition = ref(0);
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
const showContentModal = ref(false);
const contentSaving = ref(false);
const contentNotice = ref<string | null>(null);
const contentError = ref<string | null>(null);
const materialCategoryId = ref("");
const materialKind = ref<ContentKind>("text");
const materialTitle = ref("");
const materialSummary = ref("");
const materialBody = ref("");
const materialPublished = ref(true);
const materialFile = ref<NamedBlobUpload | null>(null);
const thumbnailFile = ref<File | null>(null);
const editingMaterial = ref<AdminLearningMaterial | null>(null);
const voiceRecording = ref(false);
const voiceProcessing = ref(false);
const voiceError = ref<string | null>(null);
const voicePreviewUrl = ref<string | null>(null);
let voiceRecorder: MediaRecorder | null = null;
let voiceStream: MediaStream | null = null;
let voiceChunks: Blob[] = [];
let voiceRecordingCancelled = false;
const categoryTitle = ref("");
const categoryDescription = ref("");
const hasLearningAccess = computed(
  () => session.user?.role === "admin" || session.user?.role === "owner" || session.user?.membershipStatus === "active"
);
const isModerator = computed(() => session.user?.role === "admin" || session.user?.role === "owner");

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
    .filter((group) => isModerator.value || group.items.length)
);
const hiddenMaterials = computed(() => adminMaterials.value.filter((item) => !item.isPublished && !item.archivedUntil));
const archivedMaterials = computed(() => adminMaterials.value.filter((item) => item.archivedUntil));
const lastOpenedLabel = computed(() =>
  lastOpenedItem.value ? formatLearningPlaybackLabel(lastOpenedItem.value.kind, lastOpenedPlaybackPosition.value) : ""
);
const lastOpenedTypeLabel = computed(() => (lastOpenedItem.value ? getLearningKindLabel(lastOpenedItem.value.kind) : ""));

function formatItemsCount(count: number) {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;

  if (lastDigit === 1 && lastTwoDigits !== 11) {
    return `${count} элемент`;
  }

  if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) {
    return `${count} элемента`;
  }

  return `${count} элементов`;
}

function itemMeta(item: LearningContent) {
  const type = getLearningKindLabel(item.kind);
  return item.summary ? `${type} · ${item.summary}` : type;
}

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
    lastOpenedPlaybackPosition.value = response.progress.lastOpenedPlaybackPositionSeconds;
    totalItems.value = response.progress.totalItems;
    completedItems.value = response.progress.completedItems;
    if (isModerator.value) {
      const adminResponse = await getAdminLearning();
      categories.value = adminResponse.categories;
      adminMaterials.value = adminResponse.materials;
      featured.value = adminResponse.materials.filter((item) => item.isPublished && !item.archivedUntil);
      if (!materialCategoryId.value && adminResponse.categories[0]) {
        materialCategoryId.value = adminResponse.categories[0].id;
      }
    } else {
      adminMaterials.value = [];
    }
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
    lastOpenedPlaybackPosition.value = response.playbackPositionSeconds;
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

function formatArchiveUntil(value: string | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "";
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
  if (lastOpenedItem.value?.id === selectedItem.value.id) {
    lastOpenedPlaybackPosition.value = rounded;
  }
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

function notifyContent(message: string) {
  contentNotice.value = message;
  contentError.value = null;
  if (window.Telegram?.WebApp?.showAlert) {
    window.Telegram.WebApp.showAlert(message);
    return;
  }

  window.alert(message);
}

function getMaterialSaveError(error: unknown, fallback: string) {
  const apiError = (error as { data?: { error?: string } } | null)?.data?.error;

  if (apiError === "Media file is required") {
    return "Выберите файл или дождитесь подготовки голосовой записи.";
  }

  if (apiError === "Media file type does not match material kind") {
    return "Тип файла не подходит для выбранного контента.";
  }

  if (apiError === "Thumbnail file must be an image") {
    return "Обложка должна быть изображением.";
  }

  return fallback;
}

function resetContentForm() {
  stopVoiceRecording(false);
  if (voicePreviewUrl.value) {
    URL.revokeObjectURL(voicePreviewUrl.value);
  }
  materialCategoryId.value = categories.value[0]?.id ?? "";
  materialKind.value = "text";
  materialTitle.value = "";
  materialSummary.value = "";
  materialBody.value = "";
  materialPublished.value = true;
  materialFile.value = null;
  thumbnailFile.value = null;
  editingMaterial.value = null;
  voiceError.value = null;
  voicePreviewUrl.value = null;
  categoryTitle.value = "";
  categoryDescription.value = "";
}

function openCreateContentModal() {
  resetContentForm();
  showContentModal.value = true;
}

function openEditContentModal(material: AdminLearningMaterial) {
  editingMaterial.value = material;
  materialCategoryId.value = material.categoryId;
  materialKind.value = material.kind;
  materialTitle.value = material.title;
  materialSummary.value = material.summary ?? "";
  materialBody.value = material.body ?? "";
  materialPublished.value = material.isPublished;
  materialFile.value = null;
  thumbnailFile.value = null;
  categoryTitle.value = "";
  categoryDescription.value = "";
  showContentModal.value = true;
}

function closeContentModal() {
  showContentModal.value = false;
  resetContentForm();
}

function handleMaterialFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  materialFile.value = file ? { blob: file, name: file.name } : null;
  if (materialFile.value && voicePreviewUrl.value) {
    URL.revokeObjectURL(voicePreviewUrl.value);
    voicePreviewUrl.value = null;
  }
}

function handleThumbnailFileChange(event: Event) {
  thumbnailFile.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}

async function startVoiceRecording() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    voiceError.value = "Запись голоса не поддерживается в этом браузере.";
    return;
  }

  try {
    voiceError.value = null;
    materialKind.value = "audio";
    materialFile.value = null;
    voiceRecordingCancelled = false;
    if (voicePreviewUrl.value) {
      URL.revokeObjectURL(voicePreviewUrl.value);
      voicePreviewUrl.value = null;
    }
    voiceChunks = [];
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(voiceStream);
    voiceRecorder = recorder;
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        voiceChunks.push(event.data);
      }
    });
    recorder.addEventListener("stop", () => {
      if (!voiceChunks.length) {
        voiceProcessing.value = false;
        if (!materialFile.value && !voiceRecordingCancelled) {
          voiceError.value = "Запись не получилась. Попробуйте ещё раз.";
        }
        voiceRecordingCancelled = false;
        return;
      }

      const upload = createVoiceUpload(voiceChunks, recorder.mimeType);
      materialFile.value = upload;
      if (voicePreviewUrl.value) {
        URL.revokeObjectURL(voicePreviewUrl.value);
      }
      voicePreviewUrl.value = URL.createObjectURL(upload.blob);
      voiceChunks = [];
      voiceProcessing.value = false;
      voiceRecordingCancelled = false;
    });
    recorder.start();
    voiceRecording.value = true;
  } catch {
    voiceError.value = "Не удалось получить доступ к микрофону.";
    voiceProcessing.value = false;
  }
}

function stopVoiceRecording(keepRecording = true) {
  if (voiceRecorder && voiceRecorder.state !== "inactive") {
    if (!keepRecording) {
      voiceChunks = [];
      voiceRecordingCancelled = true;
    } else {
      voiceProcessing.value = true;
    }
    voiceRecorder.stop();
  }

  voiceStream?.getTracks().forEach((track) => track.stop());
  voiceStream = null;
  voiceRecorder = null;
  voiceRecording.value = false;
  if (!keepRecording) {
    voiceProcessing.value = false;
  }
}

async function handleCreateCategory(shouldNotify = true) {
  if (!categoryTitle.value.trim()) {
    contentError.value = "Введите название категории.";
    return null;
  }

  const response = await createAdminLearningCategory({
    title: categoryTitle.value,
    description: categoryDescription.value || null
  });
  categories.value = [...categories.value, response.category];
  materialCategoryId.value = response.category.id;
  categoryTitle.value = "";
  categoryDescription.value = "";
  if (shouldNotify) {
    notifyContent("Категория создана.");
  }
  return response.category;
}

async function handleDeleteCategory(category: LearningCategory) {
  if (!window.confirm(`Удалить категорию "${category.title}" и весь контент внутри? Действие нужно подтвердить.`)) {
    return;
  }

  await deleteAdminLearningCategory(category.id);
  categories.value = categories.value.filter((item) => item.id !== category.id);
  adminMaterials.value = adminMaterials.value.filter((item) => item.categoryId !== category.id);
  featured.value = featured.value.filter((item) => item.categoryId !== category.id);
  if (materialCategoryId.value === category.id) {
    materialCategoryId.value = categories.value[0]?.id ?? "";
  }
  notifyContent("Категория удалена.");
}

async function handleToggleCategory(category: LearningCategory) {
  const action = category.isPublished ? "скрыть" : "открыть";
  if (!window.confirm(`Подтвердите: ${action} категорию "${category.title}"?`)) {
    return;
  }

  contentSaving.value = true;
  try {
    const response = await updateAdminLearningCategoryStatus(category.id, !category.isPublished);
    categories.value = categories.value.map((item) => (item.id === category.id ? response.category : item));
    await loadLearning();
    notifyContent(response.category.isPublished ? "Категория открыта." : "Категория скрыта.");
  } catch {
    contentError.value = "Не удалось изменить категорию.";
  } finally {
    contentSaving.value = false;
  }
}

async function handleSaveMaterial() {
  const validationError = getMaterialDraftError({
    title: materialTitle.value,
    kind: materialKind.value,
    isEditing: Boolean(editingMaterial.value),
    currentKind: editingMaterial.value?.kind ?? null,
    currentMediaUrl: editingMaterial.value?.mediaUrl ?? null,
    hasMediaFile: Boolean(materialFile.value),
    isVoiceRecording: voiceRecording.value,
    isVoiceProcessing: voiceProcessing.value
  });

  if (validationError) {
    contentError.value = validationError;
    return;
  }

  contentSaving.value = true;
  contentError.value = null;
  let createdCategoryId: string | null = null;
  try {
    let categoryId = materialCategoryId.value;
    if (categoryId === "__new__") {
      const category = await handleCreateCategory(false);
      if (!category) {
        return;
      }
      categoryId = category.id;
      createdCategoryId = category.id;
    }

    const form = new FormData();
    form.set("categoryId", categoryId);
    form.set("kind", materialKind.value);
    form.set("title", materialTitle.value);
    form.set("summary", materialSummary.value);
    form.set("body", materialBody.value);
    form.set("isPublished", String(materialPublished.value));
    if (materialKind.value !== "text" && materialFile.value) {
      form.set("file", materialFile.value.blob, materialFile.value.name);
    }
    if (thumbnailFile.value) {
      form.set("thumbnailFile", thumbnailFile.value);
    }

    const materialBeingEdited = editingMaterial.value;
    const response = materialBeingEdited
      ? await updateAdminLearningMaterial(materialBeingEdited.id, form)
      : await createAdminLearningMaterial(form);
    adminMaterials.value = materialBeingEdited
      ? adminMaterials.value.map((item) => (item.id === response.material.id ? response.material : item))
      : [response.material, ...adminMaterials.value];
    await loadLearning();
    closeContentModal();
    notifyContent(materialBeingEdited ? "Контент обновлён." : "Контент добавлен.");
  } catch (error) {
    if (createdCategoryId) {
      await deleteAdminLearningCategory(createdCategoryId).catch(() => null);
      categories.value = categories.value.filter((item) => item.id !== createdCategoryId);
      materialCategoryId.value = "__new__";
    }
    contentError.value = getMaterialSaveError(error, editingMaterial.value ? "Не удалось обновить контент." : "Не удалось добавить контент.");
  } finally {
    contentSaving.value = false;
  }
}

async function handleToggleMaterial(material: AdminLearningMaterial) {
  const action = material.isPublished ? "скрыть" : "открыть";
  if (!window.confirm(`Подтвердите: ${action} контент "${material.title}"?`)) {
    return;
  }

  contentSaving.value = true;
  try {
    const response = await updateAdminLearningMaterialStatus(material.id, !material.isPublished);
    adminMaterials.value = adminMaterials.value.map((item) => (item.id === material.id ? response.material : item));
    await loadLearning();
    notifyContent(response.material.isPublished ? "Контент открыт." : "Контент скрыт.");
  } catch {
    contentError.value = "Не удалось изменить доступ к контенту.";
  } finally {
    contentSaving.value = false;
  }
}

async function handleDeleteMaterial(material: AdminLearningMaterial) {
  if (!window.confirm(`Удалить контент "${material.title}"? Он будет храниться в удалённых 7 дней.`)) {
    return;
  }

  contentSaving.value = true;
  try {
    await deleteAdminLearningMaterial(material.id);
    await loadLearning();
    notifyContent("Контент удалён и перемещён в удалённые на 7 дней.");
  } catch {
    contentError.value = "Не удалось удалить контент.";
  } finally {
    contentSaving.value = false;
  }
}

function findAdminMaterial(item: LearningContent) {
  return adminMaterials.value.find((material) => material.id === item.id) ?? null;
}

async function handleToggleLearningItem(item: LearningContent) {
  const material = findAdminMaterial(item);
  if (material) {
    await handleToggleMaterial(material);
  }
}

async function handleDeleteLearningItem(item: LearningContent) {
  const material = findAdminMaterial(item);
  if (material) {
    await handleDeleteMaterial(material);
  }
}

async function handleRestoreMaterial(material: AdminLearningMaterial) {
  contentSaving.value = true;
  contentError.value = null;
  try {
    const response = await restoreAdminLearningMaterial(material.id);
    adminMaterials.value = adminMaterials.value.map((item) => (item.id === response.material.id ? response.material : item));
    await loadLearning();
    notifyContent("Контент восстановлен.");
  } catch {
    contentError.value = "Не удалось восстановить контент.";
  } finally {
    contentSaving.value = false;
  }
}

function handleEditLearningItem(item: LearningContent) {
  const material = findAdminMaterial(item);
  if (material) {
    openEditContentModal(material);
  }
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

onUnmounted(() => {
  stopVoiceRecording(false);
  if (voicePreviewUrl.value) {
    URL.revokeObjectURL(voicePreviewUrl.value);
  }
});

watch(hasLearningAccess, (hasAccess) => {
  if (!hasAccess) {
    categories.value = [];
    featured.value = [];
    selectedItem.value = null;
    lastOpenedItem.value = null;
    lastOpenedPlaybackPosition.value = 0;
    accessDenied.value = true;
    return;
  }

  void loadLearning();
});
</script>

<template>
  <section class="admin-panel learning-section-panel">
    <div class="admin-panel-head">
      <div>
        <h3>Обучение</h3>
        <p>Контент клуба, модули и личный прогресс.</p>
      </div>
      <button v-if="isModerator" class="icon-button" type="button" aria-label="Добавить контент" @click="openCreateContentModal">
        <Plus class="h-4 w-4" aria-hidden="true" />
      </button>
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

    <div v-else class="admin-mockup-list learning-content-list">
      <article class="admin-mockup-card learning-continue-card">
        <div class="admin-mockup-card-head">
          <div>
            <strong>{{ t("lastOpenedLesson") }}</strong>
            <small>{{ completedItems }} / {{ totalItems }} · {{ progressPercent }}%</small>
          </div>
          <span>{{ lastOpenedItem ? lastOpenedTypeLabel : "Старт" }}</span>
        </div>
        <p>{{ lastOpenedItem ? "Продолжите с места, где остановились." : "Откройте любой контент, и быстрый переход появится здесь." }}</p>
        <button v-if="lastOpenedItem" class="learning-continue-action" type="button" @click="openItem(lastOpenedItem)">
          <span class="learning-content-thumb learning-last-thumb">
            <img v-if="lastOpenedItem.kind === 'photo' && lastOpenedItem.mediaUrl" :src="lastOpenedItem.mediaUrl" :alt="lastOpenedItem.title" />
            <img v-else-if="lastOpenedItem.thumbnailUrl" :src="lastOpenedItem.thumbnailUrl" :alt="`Обложка: ${lastOpenedItem.title}`" />
            <component v-else :is="iconFor(lastOpenedItem.kind)" class="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            <strong>{{ lastOpenedItem.title }}</strong>
            <small>{{ lastOpenedLabel }}</small>
          </span>
        </button>
      </article>

      <div class="learning-content-title-row">
        <div>
          <h3>Контент</h3>
          <p>Категории и материалы клуба.</p>
        </div>
      </div>
      <p v-if="contentNotice" class="admin-status admin-status-ok">{{ contentNotice }}</p>
      <p v-if="contentError" class="admin-status admin-status-error">{{ contentError }}</p>

      <template v-if="materialsByCategory.length">
        <section v-for="group in materialsByCategory" :key="group.category.id" class="admin-mockup-card learning-module-card">
          <div class="admin-mockup-card-head">
            <div>
              <strong>
                {{ group.category.title }}
                <span v-if="isModerator && !group.category.isPublished" class="text-xs text-[var(--muted)]">· скрыта</span>
              </strong>
              <small>{{ formatItemsCount(group.items.length) }}</small>
            </div>
            <div v-if="isModerator" class="learning-card-actions">
              <button
                class="icon-button"
                type="button"
                :disabled="contentSaving"
                :aria-label="group.category.isPublished ? 'Скрыть категорию' : 'Открыть категорию'"
                @click="handleToggleCategory(group.category)"
              >
                <component :is="group.category.isPublished ? EyeOff : Eye" class="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                class="icon-button"
                type="button"
                :disabled="contentSaving"
                aria-label="Удалить категорию"
                @click="handleDeleteCategory(group.category)"
              >
                <Trash2 class="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <p v-if="group.category.description">{{ group.category.description }}</p>

            <div class="admin-mockup-grid learning-content-mockup-grid">
              <template v-for="item in group.items" :key="item.id">
                <article class="learning-item-row">
                  <button
                    class="admin-mockup-thumb learning-item-button"
                    type="button"
                    @click="openItem(item)"
                  >
                    <span class="learning-content-thumb">
                      <img v-if="item.kind === 'photo' && item.mediaUrl" :src="item.mediaUrl" :alt="item.title" />
                      <img v-else-if="item.thumbnailUrl" :src="item.thumbnailUrl" :alt="`Обложка: ${item.title}`" />
                      <span v-else class="learning-content-thumb-icon">
                        <component :is="iconFor(item.kind)" class="h-5 w-5" aria-hidden="true" />
                      </span>
                    </span>
                    <span>
                      {{ item.title }}
                      <ExternalLink v-if="isSelectedItem(item)" class="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <small>{{ itemMeta(item) }}</small>
                  </button>
                  <div v-if="isModerator" class="learning-item-actions">
                    <button
                      class="icon-button"
                      type="button"
                      :disabled="contentSaving"
                      aria-label="Редактировать контент"
                      @click="handleEditLearningItem(item)"
                    >
                      <Pencil class="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      class="icon-button"
                      type="button"
                      :disabled="contentSaving"
                      aria-label="Скрыть контент"
                      @click="handleToggleLearningItem(item)"
                    >
                      <EyeOff class="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      class="icon-button"
                      type="button"
                      :disabled="contentSaving"
                      aria-label="Удалить контент"
                      @click="handleDeleteLearningItem(item)"
                    >
                      <Trash2 class="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </article>

                <article v-if="selectedItem && isSelectedItem(item)" class="learning-detail-card learning-inline-content">
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
                    v-if="selectedItem.kind === 'video' && selectedItem.mediaUrl"
                    class="secondary-button mt-3 w-full"
                    type="button"
                    @click="openVideoViewer(selectedItem.mediaUrl)"
                  >
                    Открыть во весь экран
                  </button>

                  <button
                    class="primary-button mt-4"
                    type="button"
                    :disabled="completeLoading || Boolean(selectedCompletedAt)"
                    @click="markSelectedComplete"
                  >
                    {{ selectedCompletedAt ? t("lessonCompleted") : t("markLessonComplete") }}
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
              </template>
            </div>
            <p v-if="!group.items.length" class="learning-empty-category">Контента пока нет.</p>
          </section>
        </template>

        <p v-else class="text-sm text-[var(--muted)]">{{ t("emptyMaterials") }}</p>

        <section v-if="isModerator && hiddenMaterials.length" class="admin-mockup-card learning-module-card learning-state-card">
          <div class="admin-mockup-card-head">
            <div>
              <strong>Скрытые</strong>
              <small>{{ formatItemsCount(hiddenMaterials.length) }}</small>
            </div>
            <span>Админ</span>
          </div>
          <p>Материалы не видны клиентам.</p>
          <div class="learning-state-list">
            <article v-for="material in hiddenMaterials" :key="material.id" class="learning-item-row">
              <div class="learning-item-button">
                <div class="flex items-start gap-3">
                  <span class="learning-content-thumb">
                    <img v-if="material.kind === 'photo' && material.mediaUrl" :src="material.mediaUrl" :alt="material.title" />
                    <img v-else-if="material.thumbnailUrl" :src="material.thumbnailUrl" :alt="`Обложка: ${material.title}`" />
                    <component v-else :is="iconFor(material.kind)" class="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span class="min-w-0">
                    <strong class="block text-sm text-[var(--text)]">{{ material.title }}</strong>
                    <small class="mt-1 block leading-5 text-[var(--muted)]">{{ material.summary || "Скрыто от клиентов" }}</small>
                  </span>
                </div>
              </div>
              <div class="learning-item-actions">
                <button class="icon-button" type="button" :disabled="contentSaving" aria-label="Редактировать контент" @click="openEditContentModal(material)">
                  <Pencil class="h-4 w-4" aria-hidden="true" />
                </button>
                <button class="icon-button" type="button" :disabled="contentSaving" aria-label="Открыть контент" @click="handleToggleMaterial(material)">
                  <Eye class="h-4 w-4" aria-hidden="true" />
                </button>
                <button class="icon-button" type="button" :disabled="contentSaving" aria-label="Удалить контент" @click="handleDeleteMaterial(material)">
                  <Trash2 class="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </article>
          </div>
        </section>

        <section v-if="isModerator && archivedMaterials.length" class="admin-mockup-card learning-module-card learning-state-card">
          <div class="admin-mockup-card-head">
            <div>
              <strong>Удалённые</strong>
              <small>{{ formatItemsCount(archivedMaterials.length) }}</small>
            </div>
            <span>7 дней</span>
          </div>
          <p>Контент хранится 7 дней после удаления.</p>
          <div class="learning-state-list">
            <article
              v-for="material in archivedMaterials"
              :key="material.id"
              class="learning-item-row learning-item-row-archived"
              :aria-label="`Удалённый контент: ${material.title}`"
            >
              <div class="learning-item-button learning-item-button-archived">
                <div class="flex items-start gap-3">
                  <span class="learning-content-thumb learning-content-thumb-archived">
                    <img v-if="material.kind === 'photo' && material.mediaUrl" :src="material.mediaUrl" :alt="material.title" />
                    <img v-else-if="material.thumbnailUrl" :src="material.thumbnailUrl" :alt="`Обложка: ${material.title}`" />
                    <component v-else :is="iconFor(material.kind)" class="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span class="min-w-0">
                    <span class="learning-archive-badge">Удалено</span>
                    <strong class="block text-sm text-[var(--text)]">{{ material.title }}</strong>
                    <small class="mt-1 block leading-5 text-[var(--muted)]">Будет очищено после {{ formatArchiveUntil(material.archivedUntil) }}</small>
                  </span>
                </div>
                <button
                  class="learning-restore-button"
                  type="button"
                  :disabled="contentSaving"
                  @click="handleRestoreMaterial(material)"
                >
                  <RotateCcw class="h-4 w-4" aria-hidden="true" />
                  <span>Восстановить</span>
                </button>
              </div>
            </article>
          </div>
        </section>
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

      <Teleport to="body">
        <div v-if="showContentModal" class="admin-modal-backdrop" @click.self="closeContentModal">
          <aside class="admin-detail admin-client-modal" role="dialog" aria-modal="true" aria-labelledby="learning-content-modal-title">
            <header class="admin-client-modal-head">
              <div>
                <h3 id="learning-content-modal-title">{{ editingMaterial ? "Редактировать контент" : "Новый контент" }}</h3>
                <p>{{ editingMaterial ? "Измените данные контента. Файлы можно не выбирать, если они остаются прежними." : "Добавьте запись в категорию или создайте новую." }}</p>
              </div>
              <button class="icon-button" type="button" aria-label="Закрыть" @click="closeContentModal">
                <X class="h-4 w-4" aria-hidden="true" />
              </button>
            </header>

            <form class="admin-form" @submit.prevent="handleSaveMaterial">
              <select v-model="materialCategoryId" class="text-input">
                <option value="" disabled>Категория</option>
                <option v-for="category in categories" :key="category.id" :value="category.id">
                  {{ category.title }}
                </option>
                <option v-if="!editingMaterial" value="__new__">Создать новую категорию</option>
              </select>

              <div v-if="materialCategoryId === '__new__'" class="grid gap-2">
                <input v-model.trim="categoryTitle" class="text-input" placeholder="Название новой категории" />
                <input v-model.trim="categoryDescription" class="text-input" placeholder="Описание категории, необязательно" />
              </div>

              <div v-if="categories.length" class="learning-category-tools">
                <article v-for="category in categories" :key="category.id">
                  <span>{{ category.title }}</span>
                  <span class="learning-item-actions">
                    <button
                      class="icon-button"
                      type="button"
                      :disabled="contentSaving"
                      :aria-label="category.isPublished ? 'Скрыть категорию' : 'Открыть категорию'"
                      @click="handleToggleCategory(category)"
                    >
                      <component :is="category.isPublished ? EyeOff : Eye" class="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button class="icon-button" type="button" :disabled="contentSaving" aria-label="Удалить категорию" @click="handleDeleteCategory(category)">
                      <Trash2 class="h-4 w-4" aria-hidden="true" />
                    </button>
                  </span>
                </article>
              </div>

              <select v-model="materialKind" class="text-input">
                <option value="text">Текст</option>
                <option value="photo">Фото</option>
                <option value="video">Видео</option>
                <option value="audio">Аудио</option>
              </select>
              <input v-model.trim="materialTitle" class="text-input" placeholder="Название контента" />
              <input v-model.trim="materialSummary" class="text-input" placeholder="Краткое описание" />
              <textarea v-model.trim="materialBody" class="text-input min-h-28 resize-none" placeholder="Текст, описание или конспект"></textarea>
              <input
                v-if="materialKind !== 'text'"
                class="text-input"
                type="file"
                :accept="materialKind === 'photo' ? 'image/*' : materialKind === 'video' ? 'video/*' : 'audio/*'"
                @change="handleMaterialFileChange"
              />
              <p v-if="editingMaterial && materialKind !== 'text'" class="text-xs leading-5 text-[var(--muted)]">
                Не выбирайте файл, если текущий файл менять не нужно.
              </p>
              <div v-if="materialKind === 'audio'" class="voice-recorder">
                <div class="voice-recorder-actions">
                  <button
                    v-if="!voiceRecording"
                    class="secondary-button"
                    type="button"
                    :disabled="contentSaving"
                    @click="startVoiceRecording"
                  >
                    <Mic class="h-4 w-4" aria-hidden="true" />
                    Записать голос
                  </button>
                  <button
                    v-else
                    class="secondary-button voice-recorder-stop"
                    type="button"
                    @click="stopVoiceRecording()"
                  >
                    <Square class="h-4 w-4" aria-hidden="true" />
                    Остановить запись
                  </button>
                </div>
                <audio v-if="voicePreviewUrl" :src="voicePreviewUrl" controls></audio>
                <p v-if="materialFile && !voicePreviewUrl" class="voice-recorder-note">Выбран аудиофайл: {{ materialFile.name }}</p>
                <p v-if="voiceError" class="voice-recorder-error">{{ voiceError }}</p>
              </div>
              <label v-if="materialKind === 'video'" class="grid gap-2 text-sm font-semibold text-[var(--text)]">
                <span>Обложка видео, необязательно</span>
                <input class="text-input" type="file" accept="image/*" @change="handleThumbnailFileChange" />
              </label>
              <label class="admin-check-row">
                <input v-model="materialPublished" type="checkbox" />
                <span>Сразу открыть клиентам</span>
              </label>
              <p v-if="contentError" class="admin-status admin-status-error">{{ contentError }}</p>
              <button class="primary-button" type="submit" :disabled="contentSaving || (!materialCategoryId && materialCategoryId !== '__new__')">
                {{ contentSaving ? "Сохраняем..." : editingMaterial ? "Сохранить изменения" : "Добавить контент" }}
              </button>
            </form>
          </aside>
        </div>
      </Teleport>

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
  </section>
</template>
