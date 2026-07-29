import type { CommunityUploadKind, CommunityUploadedObject } from "@club/shared";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { getCommunityFileError, uploadCommunityFile } from "@/features/community/directUpload";

const storageKey = "club-community-upload-drafts-v1";
const maximumPersistedDrafts = 100;

export type CommunityUploadDraftStatus =
  | "queued"
  | "uploading"
  | "cancelled"
  | "failed"
  | "needs_file"
  | "uploaded";

export type CommunityUploadDraft = {
  id: string;
  userId: string;
  topicId: string;
  kind: CommunityUploadKind;
  file: File | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  lastModified: number;
  durationSeconds: number | null;
  previewUrl: string | null;
  status: CommunityUploadDraftStatus;
  progress: number;
  error: string | null;
  uploadToken: string | null;
};

type PersistedCommunityUploadDraft = Omit<CommunityUploadDraft, "file" | "previewUrl">;

export type CommunityUploadRunner = (
  file: File,
  options: {
    userId: string;
    kind: CommunityUploadKind;
    durationSeconds?: number;
    signal: AbortSignal;
    onProgress: (progress: number) => void;
  }
) => Promise<CommunityUploadedObject>;

type ConfigureCommunityUploads = {
  userId: string;
  topicId: string;
  storage?: Storage;
  upload?: CommunityUploadRunner;
};

function defaultUpload(file: File, options: Parameters<CommunityUploadRunner>[1]) {
  return uploadCommunityFile(file, undefined, options);
}

function createDraftId() {
  return crypto.randomUUID();
}

function safeProgress(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function normalizeKind(value: unknown): CommunityUploadKind | null {
  return value === "image" || value === "voice" || value === "video" || value === "document" ? value : null;
}

function normalizeStatus(value: unknown): CommunityUploadDraftStatus | null {
  return value === "queued" || value === "uploading" || value === "cancelled" || value === "failed"
    || value === "needs_file" || value === "uploaded" ? value : null;
}

function normalizePersistedDraft(value: unknown): PersistedCommunityUploadDraft | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PersistedCommunityUploadDraft>;
  const kind = normalizeKind(candidate.kind);
  const status = normalizeStatus(candidate.status);
  if (
    !kind
    || !status
    || typeof candidate.id !== "string"
    || typeof candidate.userId !== "string"
    || typeof candidate.topicId !== "string"
    || typeof candidate.fileName !== "string"
    || !candidate.fileName.trim()
    || candidate.fileName.length > 255
    || typeof candidate.contentType !== "string"
    || typeof candidate.sizeBytes !== "number"
    || !Number.isSafeInteger(candidate.sizeBytes)
    || candidate.sizeBytes <= 0
    || typeof candidate.lastModified !== "number"
    || !Number.isFinite(candidate.lastModified)
    || !(candidate.durationSeconds === null || (typeof candidate.durationSeconds === "number" && Number.isFinite(candidate.durationSeconds)))
    || !(candidate.uploadToken === null || typeof candidate.uploadToken === "string")
  ) return null;

  const restoredStatus = status === "uploaded" && candidate.uploadToken ? "uploaded" : "needs_file";
  return {
    id: candidate.id,
    userId: candidate.userId,
    topicId: candidate.topicId,
    kind,
    fileName: candidate.fileName,
    contentType: candidate.contentType,
    sizeBytes: candidate.sizeBytes,
    lastModified: candidate.lastModified,
    durationSeconds: candidate.durationSeconds,
    status: restoredStatus,
    progress: restoredStatus === "uploaded" ? 100 : 0,
    error: null,
    uploadToken: restoredStatus === "uploaded" ? candidate.uploadToken : null
  };
}

function readPersisted(storage: Storage) {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value) => {
      const normalized = normalizePersistedDraft(value);
      return normalized ? [normalized] : [];
    }).slice(-maximumPersistedDrafts);
  } catch {
    return [];
  }
}

function writePersisted(storage: Storage, drafts: PersistedCommunityUploadDraft[]) {
  try {
    if (drafts.length) storage.setItem(storageKey, JSON.stringify(drafts.slice(-maximumPersistedDrafts)));
    else storage.removeItem(storageKey);
  } catch {
    // Uploads still work in-memory when browser storage is blocked.
  }
}

function persistedDraft(draft: CommunityUploadDraft): PersistedCommunityUploadDraft {
  const { file: _file, previewUrl: _previewUrl, ...safe } = draft;
  return safe;
}

function draftPreview(file: File, kind: CommunityUploadKind) {
  if (kind !== "image" && kind !== "video") return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

function releasePreview(draft: CommunityUploadDraft) {
  if (draft.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(draft.previewUrl);
}

function policyMessage(kind: CommunityUploadKind, error: ReturnType<typeof getCommunityFileError>) {
  if (error === "file_too_large") {
    const limit = kind === "image" ? 15 : kind === "voice" ? 30 : kind === "video" ? 100 : 50;
    const label = kind === "image" ? "изображения" : kind === "voice" ? "голосового сообщения" : kind === "video" ? "видео" : "документа";
    return `Размер ${label} не должен превышать ${limit} МБ.`;
  }
  if (error === "invalid_duration") return "Голосовое сообщение должно длиться от 1 секунды до 5 минут.";
  return "Этот формат файла не поддерживается.";
}

function uploadFailureMessage(reason: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "Нет соединения. Подключитесь к сети и повторите загрузку.";
  const code = reason instanceof Error ? reason.message : "";
  if (code === "expired_intent") return "Срок загрузки истёк. Повторите загрузку файла.";
  return "Не удалось загрузить файл. Попробуйте ещё раз.";
}

export function formatCommunityFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let value = bytes / 1024;
  let unit = units[0]!;
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index]!;
  }
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

export function clearCommunityUploadDraftsForUser(userId: string, storage: Storage = localStorage) {
  writePersisted(storage, readPersisted(storage).filter((draft) => draft.userId !== userId));
}

export const useCommunityUploadsStore = defineStore("communityUploads", () => {
  const drafts = ref<CommunityUploadDraft[]>([]);
  const scopeError = ref<string | null>(null);
  const currentUserId = ref<string | null>(null);
  const currentTopicId = ref<string | null>(null);
  const controllers = new Map<string, AbortController>();
  let storage: Storage | null = null;
  let runner: CommunityUploadRunner = defaultUpload;
  let generation = 0;

  const uploadedTokens = computed(() => drafts.value.flatMap((draft) =>
    draft.status === "uploaded" && draft.uploadToken ? [draft.uploadToken] : []
  ));
  const uploading = computed(() => drafts.value.some((draft) => draft.status === "uploading"));

  function save() {
    if (!storage || !currentUserId.value || !currentTopicId.value) return;
    const currentScope = drafts.value.map(persistedDraft);
    const otherScopes = readPersisted(storage).filter((draft) =>
      draft.userId !== currentUserId.value || draft.topicId !== currentTopicId.value
    );
    writePersisted(storage, [...otherScopes, ...currentScope]);
  }

  function abortActive() {
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
  }

  function releaseDrafts() {
    drafts.value.forEach(releasePreview);
    drafts.value = [];
  }

  function configure(input: ConfigureCommunityUploads) {
    generation += 1;
    abortActive();
    releaseDrafts();
    scopeError.value = null;
    currentUserId.value = input.userId;
    currentTopicId.value = input.topicId;
    storage = input.storage ?? localStorage;
    runner = input.upload ?? defaultUpload;
    drafts.value = readPersisted(storage)
      .filter((draft) => draft.userId === input.userId && draft.topicId === input.topicId)
      .map((draft) => ({ ...draft, file: null, previewUrl: null }));
    save();
  }

  function addFiles(files: File[], options: { kind: CommunityUploadKind; durationSeconds?: number }) {
    scopeError.value = null;
    const userId = currentUserId.value;
    const topicId = currentTopicId.value;
    if (!userId || !topicId) return [];
    if (drafts.value.some((draft) => draft.kind !== options.kind)) {
      scopeError.value = "Сначала отправьте или удалите выбранные вложения другого типа.";
      return [];
    }
    const remainingImages = options.kind === "image"
      ? Math.max(0, 10 - drafts.value.filter((draft) => draft.kind === "image").length)
      : drafts.value.length ? 0 : 1;
    const accepted: CommunityUploadDraft[] = [];
    for (const file of files.slice(0, remainingImages)) {
      const error = getCommunityFileError(file, {
        kind: options.kind,
        ...(options.durationSeconds === undefined ? {} : { durationSeconds: options.durationSeconds })
      });
      if (error) {
        scopeError.value = policyMessage(options.kind, error);
        continue;
      }
      const draft: CommunityUploadDraft = {
        id: createDraftId(),
        userId,
        topicId,
        kind: options.kind,
        file,
        fileName: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        lastModified: file.lastModified,
        durationSeconds: options.kind === "voice" ? Math.round(options.durationSeconds ?? 0) : null,
        previewUrl: draftPreview(file, options.kind),
        status: "queued",
        progress: 0,
        error: null,
        uploadToken: null
      };
      drafts.value.push(draft);
      accepted.push(draft);
    }
    if (files.length > remainingImages) {
      scopeError.value = options.kind === "image"
        ? "Можно отправить не больше 10 изображений."
        : "Видео, документ или голосовое сообщение отправляются по одному.";
    }
    save();
    return accepted;
  }

  async function uploadDraft(id: string) {
    const draft = drafts.value.find((item) => item.id === id);
    if (!draft || !draft.file || draft.status === "uploading" || draft.status === "uploaded") return null;
    const owner = { generation, userId: draft.userId, topicId: draft.topicId, file: draft.file };
    const controller = new AbortController();
    controllers.set(id, controller);
    draft.status = "uploading";
    draft.error = null;
    save();
    try {
      const completed = await runner(owner.file, {
        userId: owner.userId,
        kind: draft.kind,
        ...(draft.durationSeconds ? { durationSeconds: draft.durationSeconds } : {}),
        signal: controller.signal,
        onProgress: (progress) => {
          if (generation !== owner.generation || controller.signal.aborted) return;
          const current = drafts.value.find((item) => item.id === id);
          if (current) current.progress = safeProgress(progress);
        }
      });
      if (generation !== owner.generation || currentUserId.value !== owner.userId || currentTopicId.value !== owner.topicId) return null;
      const current = drafts.value.find((item) => item.id === id);
      if (!current) return null;
      current.status = "uploaded";
      current.progress = 100;
      current.uploadToken = completed.uploadToken;
      current.error = null;
      save();
      return completed;
    } catch (reason) {
      if (generation !== owner.generation || currentUserId.value !== owner.userId || currentTopicId.value !== owner.topicId) return null;
      const current = drafts.value.find((item) => item.id === id);
      if (!current) return null;
      if (controller.signal.aborted || (reason instanceof DOMException && reason.name === "AbortError")) {
        current.status = "cancelled";
        current.error = "Загрузка отменена.";
      } else {
        current.status = "failed";
        current.error = uploadFailureMessage(reason);
      }
      save();
      return null;
    } finally {
      if (controllers.get(id) === controller) controllers.delete(id);
    }
  }

  async function uploadDrafts(ids = drafts.value.map((draft) => draft.id)) {
    for (const id of ids) await uploadDraft(id);
    return ids.every((id) => drafts.value.find((draft) => draft.id === id)?.status === "uploaded");
  }

  function cancelDraft(id: string) {
    controllers.get(id)?.abort();
  }

  function retryDraft(id: string) {
    return uploadDraft(id);
  }

  function reattachFile(id: string, file: File) {
    const draft = drafts.value.find((item) => item.id === id);
    if (!draft || draft.status !== "needs_file") return false;
    if (
      file.name !== draft.fileName
      || file.type !== draft.contentType
      || file.size !== draft.sizeBytes
      || file.lastModified !== draft.lastModified
    ) {
      draft.error = "Выберите исходный файл с тем же именем и размером.";
      return false;
    }
    draft.file = file;
    draft.previewUrl = draftPreview(file, draft.kind);
    draft.status = "queued";
    draft.error = null;
    save();
    return true;
  }

  function removeDraft(id: string) {
    const draft = drafts.value.find((item) => item.id === id);
    if (!draft) return;
    controllers.get(id)?.abort();
    releasePreview(draft);
    drafts.value = drafts.value.filter((item) => item.id !== id);
    save();
  }

  function removeDrafts(ids: string[]) {
    ids.forEach(removeDraft);
  }

  function removeDraftsForScope(ids: string[], userId: string, topicId: string) {
    const idSet = new Set(ids);
    if (currentUserId.value === userId && currentTopicId.value === topicId) {
      removeDrafts(ids);
      return;
    }
    const targetStorage = storage ?? localStorage;
    writePersisted(targetStorage, readPersisted(targetStorage).filter((draft) =>
      draft.userId !== userId || draft.topicId !== topicId || !idSet.has(draft.id)
    ));
  }

  function clearScope() {
    generation += 1;
    abortActive();
    releaseDrafts();
    scopeError.value = null;
    save();
  }

  function suspend() {
    generation += 1;
    abortActive();
    releaseDrafts();
    scopeError.value = null;
    currentUserId.value = null;
    currentTopicId.value = null;
  }

  return {
    drafts,
    scopeError,
    currentUserId,
    currentTopicId,
    uploadedTokens,
    uploading,
    configure,
    addFiles,
    uploadDraft,
    uploadDrafts,
    retryDraft,
    cancelDraft,
    reattachFile,
    removeDraft,
    removeDrafts,
    removeDraftsForScope,
    clearScope,
    suspend
  };
});
