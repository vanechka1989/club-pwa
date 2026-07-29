import type {
  CommunityUploadIntent,
  CommunityUploadIntentResponse,
  CommunityUploadedObject
} from "@club/shared";
import {
  completeCommunityMultipartUpload,
  completeCommunityPutUpload,
  createCommunityUploadIntent,
  refreshCommunityMultipartUpload,
  abortCommunityUpload
} from "../../api/client";

const MiB = 1024 * 1024;
const storageKey = "club-community-multipart-sessions";
const multipartConcurrency = 4;

const allowedTypes = {
  image: new Map([
    ["image/jpeg", new Set(["jpg", "jpeg"])],
    ["image/png", new Set(["png"])],
    ["image/webp", new Set(["webp"])],
    ["image/heic", new Set(["heic"])],
    ["image/heif", new Set(["heif"])]
  ]),
  voice: new Map([
    ["audio/webm", new Set(["webm"])],
    ["audio/mp4", new Set(["m4a", "mp4"])],
    ["video/mp4", new Set(["m4a", "mp4"])],
    ["audio/ogg", new Set(["ogg", "oga", "opus"])],
    ["audio/mpeg", new Set(["mp3"])],
    ["audio/aac", new Set(["aac"])],
    ["audio/wav", new Set(["wav"])],
    ["audio/x-wav", new Set(["wav"])]
  ]),
  video: new Map([
    ["video/mp4", new Set(["mp4", "m4v"])],
    ["video/quicktime", new Set(["mov"])],
    ["video/webm", new Set(["webm"])]
  ]),
  document: new Map([
    ["application/pdf", new Set(["pdf"])],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Set(["docx"])],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new Set(["xlsx"])],
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation", new Set(["pptx"])]
  ])
} as const;

function fileExtension(fileName: string) {
  return fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

function inferKind(file: File): CommunityUploadIntent["kind"] | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/") || (file.type === "video/mp4" && fileExtension(file.name) === "m4a")) return "voice";
  if (file.type.startsWith("video/")) return "video";
  if (allowedTypes.document.has(file.type as never)) return "document";
  return null;
}

export function describeCommunityFile(
  file: File,
  options: { kind?: CommunityUploadIntent["kind"]; durationSeconds?: number } = {}
): CommunityUploadIntent {
  const kind = options.kind ?? inferKind(file);
  if (!kind) throw new Error("unsupported_type");
  const base = { kind, fileName: file.name, contentType: file.type, sizeBytes: file.size };
  if (kind === "voice") {
    const durationSeconds = options.durationSeconds ?? (file as File & { durationSeconds?: number }).durationSeconds;
    return { ...base, kind, contentType: file.type as "audio/webm", durationSeconds: Math.round(durationSeconds ?? 0) };
  }
  return base as CommunityUploadIntent;
}

export function getCommunityFileError(
  file: File,
  options: { kind?: CommunityUploadIntent["kind"]; durationSeconds?: number } = {}
) {
  let input: CommunityUploadIntent;
  try {
    input = describeCommunityFile(file, options);
  } catch {
    return "unsupported_type" as const;
  }
  const types = allowedTypes[input.kind] as ReadonlyMap<string, ReadonlySet<string>>;
  const extensions = types.get(input.contentType);
  if (!extensions) return "unsupported_type" as const;
  if (!extensions.has(fileExtension(input.fileName))) return "type_extension_mismatch" as const;
  const maxBytes = input.kind === "image" ? 15 * MiB : input.kind === "voice" ? 30 * MiB : input.kind === "video" ? 100 * MiB : 50 * MiB;
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > maxBytes) return "file_too_large" as const;
  if (input.kind === "voice" && (input.durationSeconds < 1 || input.durationSeconds > 300)) return "invalid_duration" as const;
  return null;
}

type MultipartCompleteInput = {
  uploadToken: string;
  parts: Array<{ partNumber: number; etag: string }>;
};

type MultipartRefresh = {
  uploadToken: string;
  uploadId: string;
  partSizeBytes: number;
  parts: Array<{ partNumber: number; uploadUrl: string }>;
  completedParts: Array<{ partNumber: number; etag: string }>;
  expiresAt: string;
};

type UploadTransportRuntime = {
  signal?: AbortSignal;
  onProgress?: (loadedBytes: number) => void;
};

export type CommunityUploadRuntimeOptions = {
  userId: string;
  kind?: CommunityUploadIntent["kind"];
  durationSeconds?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
};

type UploadDependencies = {
  createIntent: (input: CommunityUploadIntent) => Promise<CommunityUploadIntentResponse>;
  putObject: (
    url: string,
    body: Blob,
    contentType: string,
    partNumber?: number,
    runtime?: UploadTransportRuntime
  ) => Promise<string | void>;
  completePut: (input: { uploadToken: string }) => Promise<CommunityUploadedObject>;
  completeMultipart: (input: MultipartCompleteInput) => Promise<CommunityUploadedObject>;
  refreshMultipart: (uploadToken: string) => Promise<MultipartRefresh>;
  abortUpload: (uploadToken: string) => Promise<unknown>;
  storage: Pick<Storage, "getItem" | "setItem">;
};

type StoredMultipartSession = {
  userId: string;
  file: { name: string; type: string; size: number; lastModified: number };
  uploadToken: string;
  uploadId: string;
  partSizeBytes: number;
  expiresAt: string;
  completedParts: Array<{ partNumber: number; etag: string }>;
};

let liveUploadTokens = new WeakMap<File, { userId: string; uploadToken: string }>();

function readSessions(storage: UploadDependencies["storage"]): StoredMultipartSession[] {
  try {
    const value = JSON.parse(storage.getItem(storageKey) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry): StoredMultipartSession[] => {
      if (!entry || typeof entry !== "object") return [];
      const candidate = entry as Record<string, unknown>;
      const file = candidate.file as Record<string, unknown> | undefined;
      const completedParts = candidate.completedParts;
      if (
        typeof candidate.userId !== "string" ||
        typeof candidate.uploadToken !== "string" ||
        typeof candidate.uploadId !== "string" ||
        typeof candidate.partSizeBytes !== "number" ||
        typeof candidate.expiresAt !== "string" ||
        !file ||
        typeof file.name !== "string" ||
        typeof file.type !== "string" ||
        typeof file.size !== "number" ||
        typeof file.lastModified !== "number" ||
        !Array.isArray(completedParts) ||
        !completedParts.every((part) => part && typeof part === "object" &&
          Number.isInteger((part as Record<string, unknown>).partNumber) &&
          typeof (part as Record<string, unknown>).etag === "string")
      ) return [];
      return [{
        userId: candidate.userId,
        file: { name: file.name, type: file.type, size: file.size, lastModified: file.lastModified },
        uploadToken: candidate.uploadToken,
        uploadId: candidate.uploadId,
        partSizeBytes: candidate.partSizeBytes,
        expiresAt: candidate.expiresAt,
        completedParts: completedParts.map((part) => ({
          partNumber: (part as { partNumber: number }).partNumber,
          etag: (part as { etag: string }).etag
        }))
      }];
    });
  } catch {
    return [];
  }
}

function writeSessions(storage: UploadDependencies["storage"], sessions: StoredMultipartSession[]) {
  storage.setItem(storageKey, JSON.stringify(sessions.slice(-10)));
}

function sameLiveFile(session: StoredMultipartSession, file: File, userId: string) {
  const live = liveUploadTokens.get(file);
  return session.userId === userId && live?.userId === userId && live.uploadToken === session.uploadToken;
}

function persistSession(storage: UploadDependencies["storage"], session: StoredMultipartSession) {
  writeSessions(storage, [...readSessions(storage).filter((item) => item.uploadToken !== session.uploadToken), session]);
}

function removeSession(storage: UploadDependencies["storage"], uploadToken: string) {
  writeSessions(storage, readSessions(storage).filter((item) => item.uploadToken !== uploadToken));
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  let failed = false;
  let firstError: unknown;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && cursor < items.length) {
      const item = items[cursor++];
      if (item === undefined) continue;
      try {
        await worker(item);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
  });
  await Promise.all(workers);
  if (failed) throw firstError;
}

function isUnrecoverableUploadError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (["invalid_part_size", "missing_part_etag", "intent_mismatch", "foreign_object", "expired_intent"].includes(code)) return true;
  const status = (error as { response?: { status?: number }; status?: number } | null)?.response?.status ??
    (error as { status?: number } | null)?.status;
  return typeof status === "number" && [400, 403, 404, 410, 422].includes(status);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function safeUploadPercent(loadedBytes: number, totalBytes: number) {
  if (!Number.isFinite(loadedBytes) || !Number.isFinite(totalBytes) || totalBytes <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((loadedBytes / totalBytes) * 100)));
}

export function putCommunityObject(
  url: string,
  body: Blob,
  contentType: string,
  _partNumber?: number,
  runtime: UploadTransportRuntime = {}
) {
  return new Promise<string | void>((resolve, reject) => {
    if (runtime.signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => runtime.signal?.removeEventListener("abort", abort);
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", contentType);
    request.upload.addEventListener("progress", (event) => runtime.onProgress?.(Math.min(body.size, event.loaded)));
    request.addEventListener("load", () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) resolve(request.getResponseHeader("ETag") ?? undefined);
      else reject(new Error("community_s3_upload_failed"));
    });
    request.addEventListener("error", () => {
      cleanup();
      reject(new Error("community_s3_upload_failed"));
    });
    request.addEventListener("abort", () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    });
    runtime.signal?.addEventListener("abort", abort, { once: true });
    request.send(body);
  });
}

const productionDependencies: UploadDependencies = {
  createIntent: (input) => createCommunityUploadIntent(input),
  putObject: putCommunityObject,
  completePut: (input) => completeCommunityPutUpload(input),
  completeMultipart: (input) => completeCommunityMultipartUpload(input),
  refreshMultipart: (uploadToken) => refreshCommunityMultipartUpload(uploadToken),
  abortUpload: (uploadToken) => abortCommunityUpload(uploadToken),
  storage: localStorage
};

export function clearCommunityUploadSessions(storage: UploadDependencies["storage"] = localStorage, userId?: string) {
  writeSessions(storage, userId ? readSessions(storage).filter((session) => session.userId !== userId) : []);
  liveUploadTokens = new WeakMap<File, { userId: string; uploadToken: string }>();
}

export async function uploadCommunityFile(
  file: File,
  dependencies: UploadDependencies = productionDependencies,
  options: CommunityUploadRuntimeOptions
): Promise<CommunityUploadedObject> {
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const policyError = getCommunityFileError(file, options);
  if (policyError) throw new Error(policyError);
  const description = describeCommunityFile(file, options);
  const sessions = readSessions(dependencies.storage);
  const resumable = sessions.find((session) => sameLiveFile(session, file, options.userId) && Date.parse(session.expiresAt) > Date.now());
  const initialIntent = resumable ? null : await dependencies.createIntent(description);

  if (initialIntent?.uploadType === "put") {
    liveUploadTokens.set(file, { userId: options.userId, uploadToken: initialIntent.uploadToken });
    try {
      await dependencies.putObject(initialIntent.uploadUrl, file, initialIntent.contentType, undefined, {
        ...(options.signal ? { signal: options.signal } : {}),
        onProgress: (loadedBytes) => options.onProgress?.(safeUploadPercent(loadedBytes, file.size))
      });
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const completed = await dependencies.completePut({ uploadToken: initialIntent.uploadToken });
      options.onProgress?.(100);
      liveUploadTokens.delete(file);
      return completed;
    } catch (error) {
      if (isAbortError(error) || isUnrecoverableUploadError(error)) {
        await dependencies.abortUpload(initialIntent.uploadToken).catch(() => undefined);
        liveUploadTokens.delete(file);
      }
      throw error;
    }
  }

  const refreshed = resumable ? await dependencies.refreshMultipart(resumable.uploadToken) : null;
  const multipart: MultipartRefresh | Extract<CommunityUploadIntentResponse, { uploadType: "multipart" }> =
    refreshed ?? initialIntent as Extract<CommunityUploadIntentResponse, { uploadType: "multipart" }>;
  const session: StoredMultipartSession = resumable ?? {
    userId: options.userId,
    file: { name: file.name, type: file.type, size: file.size, lastModified: file.lastModified },
    uploadToken: multipart.uploadToken,
    uploadId: multipart.uploadId,
    partSizeBytes: multipart.partSizeBytes,
    expiresAt: multipart.expiresAt,
    completedParts: []
  };
  liveUploadTokens.set(file, { userId: options.userId, uploadToken: session.uploadToken });
  if (resumable && refreshed) session.completedParts = refreshed.completedParts;
  persistSession(dependencies.storage, session);
  const completedByNumber = new Map(session.completedParts.map((part) => [part.partNumber, part]));
  const pendingParts = multipart.parts.filter((part) => !completedByNumber.has(part.partNumber));
  const partLoaded = new Map<number, number>();
  const partByteSize = (partNumber: number) => {
    const start = (partNumber - 1) * multipart.partSizeBytes;
    return Math.max(0, Math.min(multipart.partSizeBytes, file.size - start));
  };
  const reportMultipartProgress = () => {
    const completedBytes = [...completedByNumber.keys()].reduce((total, partNumber) => total + partByteSize(partNumber), 0);
    const inFlightBytes = [...partLoaded.entries()]
      .filter(([partNumber]) => !completedByNumber.has(partNumber))
      .reduce((total, [, loaded]) => total + loaded, 0);
    options.onProgress?.(safeUploadPercent(completedBytes + inFlightBytes, file.size));
  };
  reportMultipartProgress();
  try {
    await runWithConcurrency(pendingParts, multipartConcurrency, async (part) => {
      if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const start = (part.partNumber - 1) * multipart.partSizeBytes;
      const end = Math.min(start + multipart.partSizeBytes, file.size);
      const chunk = file.slice(start, end, description.contentType);
      if (chunk.size < 1 || chunk.size > multipart.partSizeBytes) throw new Error("invalid_part_size");
      const etag = await dependencies.putObject(part.uploadUrl, chunk, description.contentType, part.partNumber, {
        ...(options.signal ? { signal: options.signal } : {}),
        onProgress: (loadedBytes) => {
          partLoaded.set(part.partNumber, Math.min(chunk.size, loadedBytes));
          reportMultipartProgress();
        }
      });
      if (!etag) throw new Error("missing_part_etag");
      partLoaded.delete(part.partNumber);
      completedByNumber.set(part.partNumber, { partNumber: part.partNumber, etag });
      session.completedParts = [...completedByNumber.values()].sort((left, right) => left.partNumber - right.partNumber);
      persistSession(dependencies.storage, session);
      reportMultipartProgress();
    });

    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const completed = await dependencies.completeMultipart({
      uploadToken: session.uploadToken,
      parts: [...completedByNumber.values()].sort((left, right) => left.partNumber - right.partNumber)
    });
    removeSession(dependencies.storage, session.uploadToken);
    liveUploadTokens.delete(file);
    options.onProgress?.(100);
    return completed;
  } catch (error) {
    if (isAbortError(error) || isUnrecoverableUploadError(error)) {
      await dependencies.abortUpload(session.uploadToken).catch(() => undefined);
      removeSession(dependencies.storage, session.uploadToken);
      liveUploadTokens.delete(file);
    }
    throw error;
  }
}

export async function cancelCommunityFileUpload(
  file: File,
  userId: string,
  dependencies: Pick<UploadDependencies, "abortUpload" | "storage"> = productionDependencies
) {
  const live = liveUploadTokens.get(file);
  if (!live || live.userId !== userId) return { ok: true as const };
  await dependencies.abortUpload(live.uploadToken);
  removeSession(dependencies.storage, live.uploadToken);
  liveUploadTokens.delete(file);
  return { ok: true as const };
}
