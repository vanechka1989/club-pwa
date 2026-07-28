import type {
  CommunityUploadIntent,
  CommunityUploadIntentResponse,
  CommunityUploadedObject
} from "@club/shared";
import {
  completeCommunityMultipartUpload,
  completeCommunityPutUpload,
  createCommunityUploadIntent
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
  upload: CommunityUploadedObject;
  uploadId: string;
  partSizeBytes: number;
  parts: Array<{ partNumber: number; etag: string }>;
};

type UploadDependencies = {
  createIntent: (input: CommunityUploadIntent) => Promise<CommunityUploadIntentResponse>;
  putObject: (url: string, body: Blob, contentType: string, partNumber?: number) => Promise<string | void>;
  completePut: (uploaded: CommunityUploadedObject) => Promise<CommunityUploadedObject>;
  completeMultipart: (input: MultipartCompleteInput) => Promise<CommunityUploadedObject>;
  storage: Pick<Storage, "getItem" | "setItem">;
};

type StoredMultipartSession = {
  file: { name: string; type: string; size: number; lastModified: number };
  intent: Extract<CommunityUploadIntentResponse, { uploadType: "multipart" }>;
  completedParts: Array<{ partNumber: number; etag: string }>;
};

function readSessions(storage: UploadDependencies["storage"]): StoredMultipartSession[] {
  try {
    const value = JSON.parse(storage.getItem(storageKey) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter((entry): entry is StoredMultipartSession => Boolean(entry && typeof entry === "object")) : [];
  } catch {
    return [];
  }
}

function writeSessions(storage: UploadDependencies["storage"], sessions: StoredMultipartSession[]) {
  storage.setItem(storageKey, JSON.stringify(sessions.slice(-10)));
}

function sameFile(session: StoredMultipartSession, file: File) {
  return session.file.name === file.name && session.file.type === file.type && session.file.size === file.size && session.file.lastModified === file.lastModified;
}

function persistSession(storage: UploadDependencies["storage"], session: StoredMultipartSession) {
  writeSessions(storage, [...readSessions(storage).filter((item) => item.intent.uploadToken !== session.intent.uploadToken), session]);
}

function removeSession(storage: UploadDependencies["storage"], uploadToken: string) {
  writeSessions(storage, readSessions(storage).filter((item) => item.intent.uploadToken !== uploadToken));
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

export async function putCommunityObject(url: string, body: Blob, contentType: string) {
  const response = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body });
  if (!response.ok) throw new Error("community_s3_upload_failed");
  return response.headers.get("ETag") ?? undefined;
}

const productionDependencies: UploadDependencies = {
  createIntent: createCommunityUploadIntent,
  putObject: putCommunityObject,
  completePut: completeCommunityPutUpload,
  completeMultipart: completeCommunityMultipartUpload,
  storage: localStorage
};

export async function uploadCommunityFile(
  file: File,
  dependencies: UploadDependencies = productionDependencies,
  options: { kind?: CommunityUploadIntent["kind"]; durationSeconds?: number } = {}
): Promise<CommunityUploadedObject> {
  const policyError = getCommunityFileError(file, options);
  if (policyError) throw new Error(policyError);
  const description = describeCommunityFile(file, options);
  const sessions = readSessions(dependencies.storage);
  const resumable = sessions.find((session) => sameFile(session, file) && Date.parse(session.intent.expiresAt) > Date.now());
  const intent = resumable?.intent ?? await dependencies.createIntent(description);
  const uploaded = {
    ...description,
    objectKey: intent.objectKey,
    uploadToken: intent.uploadToken
  } as CommunityUploadedObject;

  if (intent.uploadType === "put") {
    await dependencies.putObject(intent.uploadUrl, file, intent.contentType);
    return dependencies.completePut(uploaded);
  }

  const session: StoredMultipartSession = resumable ?? {
    file: { name: file.name, type: file.type, size: file.size, lastModified: file.lastModified },
    intent,
    completedParts: []
  };
  persistSession(dependencies.storage, session);
  const completedByNumber = new Map(session.completedParts.map((part) => [part.partNumber, part]));
  const pendingParts = intent.parts.filter((part) => !completedByNumber.has(part.partNumber));
  await runWithConcurrency(pendingParts, multipartConcurrency, async (part) => {
    const start = (part.partNumber - 1) * intent.partSizeBytes;
    const end = Math.min(start + intent.partSizeBytes, file.size);
    const chunk = file.slice(start, end, intent.contentType);
    if (chunk.size < 1 || chunk.size > intent.partSizeBytes) throw new Error("invalid_part_size");
    const etag = await dependencies.putObject(part.uploadUrl, chunk, intent.contentType, part.partNumber);
    if (!etag) throw new Error("missing_part_etag");
    completedByNumber.set(part.partNumber, { partNumber: part.partNumber, etag });
    session.completedParts = [...completedByNumber.values()].sort((left, right) => left.partNumber - right.partNumber);
    persistSession(dependencies.storage, session);
  });

  const completed = await dependencies.completeMultipart({
    upload: uploaded,
    uploadId: intent.uploadId,
    partSizeBytes: intent.partSizeBytes,
    parts: [...completedByNumber.values()].sort((left, right) => left.partNumber - right.partNumber)
  });
  removeSession(dependencies.storage, intent.uploadToken);
  return completed;
}
