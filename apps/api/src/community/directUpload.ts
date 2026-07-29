import type { CommunityUploadIntent, CommunityUploadedObject } from "@club/shared";
import { createHash, randomUUID } from "node:crypto";
import type { CommunityObjectPublicationClaim } from "./objectPublication";

export const communityDirectPutMaxBytes = 25 * 1024 * 1024;
export const communityMultipartPartSizeBytes = 8 * 1024 * 1024;
export const communityMaxMultipartParts = 100;
export const communityUploadIntentTtlMs = 10 * 60 * 1000;
export const communityCompletedUploadAttachmentGraceMs = 15 * 60 * 1000;
export const communitySignaturePrefixBytes = 4096;

export type CommunityUploadError =
  | "unsupported_type"
  | "type_extension_mismatch"
  | "file_too_large"
  | "invalid_duration"
  | "too_many_files";

const imageTypes = new Map([
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/png", new Set(["png"])],
  ["image/webp", new Set(["webp"])],
  ["image/heic", new Set(["heic"])],
  ["image/heif", new Set(["heif"])]
]);
const voiceTypes = new Map([
  ["audio/webm", new Set(["webm"])],
  ["audio/mp4", new Set(["m4a", "mp4"])],
  ["video/mp4", new Set(["m4a", "mp4"])],
  ["audio/ogg", new Set(["ogg", "oga", "opus"])],
  ["audio/mpeg", new Set(["mp3"])],
  ["audio/aac", new Set(["aac"])],
  ["audio/wav", new Set(["wav"])],
  ["audio/x-wav", new Set(["wav"])]
]);
const videoTypes = new Map([
  ["video/mp4", new Set(["mp4", "m4v"])],
  ["video/quicktime", new Set(["mov"])],
  ["video/webm", new Set(["webm"])]
]);
const documentTypes = new Map([
  ["application/pdf", new Set(["pdf"])],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", new Set(["docx"])],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new Set(["xlsx"])],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", new Set(["pptx"])]
]);

function extension(fileName: string) {
  return fileName.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

function typesForKind(kind: CommunityUploadIntent["kind"]) {
  if (kind === "image") return imageTypes;
  if (kind === "voice") return voiceTypes;
  if (kind === "video") return videoTypes;
  return documentTypes;
}

function maxSizeForKind(kind: CommunityUploadIntent["kind"]) {
  if (kind === "image") return 15 * 1024 * 1024;
  if (kind === "voice") return 30 * 1024 * 1024;
  if (kind === "video") return 100 * 1024 * 1024;
  return 50 * 1024 * 1024;
}

export function getCommunityUploadError(input: CommunityUploadIntent, imageCount = 1): CommunityUploadError | null {
  if (input.kind === "image" && (imageCount < 1 || imageCount > 10)) return "too_many_files";
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > maxSizeForKind(input.kind)) {
    return "file_too_large";
  }
  const allowedExtensions = typesForKind(input.kind).get(input.contentType);
  if (!allowedExtensions) return "unsupported_type";
  if (!allowedExtensions.has(extension(input.fileName))) return "type_extension_mismatch";
  if (input.kind === "voice" && (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 1 || input.durationSeconds > 300)) {
    return "invalid_duration";
  }
  return null;
}

function sanitizeKeyPart(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "media";
}

export function buildCommunityPendingObjectKey({
  userId,
  uploadToken,
  fileName,
  now = new Date()
}: {
  userId: string;
  uploadToken: string;
  fileName: string;
  now?: Date;
}) {
  return `community/pending/${sanitizeKeyPart(userId)}/${now.toISOString().slice(0, 10)}/${sanitizeKeyPart(uploadToken)}-${sanitizeKeyPart(fileName)}`;
}

function startsWith(bytes: Uint8Array, prefix: number[]) {
  return bytes.length >= prefix.length && prefix.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return new TextDecoder("ascii").decode(bytes.slice(start, start + length));
}

function hasIsoMediaSignature(bytes: Uint8Array) {
  return ascii(bytes, 4, 4) === "ftyp";
}

function hasFragmentedVoiceIsoMediaSignature(bytes: Uint8Array) {
  if (hasIsoMediaSignature(bytes)) return true;
  if (ascii(bytes, 4, 4) !== "moof") return false;
  const maxOffset = Math.min(bytes.length - 4, 1024);
  for (let offset = 8; offset <= maxOffset; offset += 1) {
    if (ascii(bytes, offset, 4) === "ftyp") return true;
  }
  return false;
}

function hasDangerousSignature(bytes: Uint8Array) {
  if (startsWith(bytes, [0x4d, 0x5a]) || startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return true;
  const prefix = new TextDecoder().decode(bytes.slice(0, 256)).trimStart().toLowerCase();
  return prefix.startsWith("<svg") || prefix.startsWith("<?xml") && prefix.includes("<svg") || prefix.startsWith("<!doctype html") || prefix.startsWith("<html");
}

function hasZipSignature(bytes: Uint8Array) {
  return startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) || startsWith(bytes, [0x50, 0x4b, 0x07, 0x08]);
}

export function validateCommunitySignature(input: CommunityUploadIntent, bytes: Uint8Array) {
  if (hasDangerousSignature(bytes)) return false;
  if (input.kind !== "document" && hasZipSignature(bytes)) return false;

  switch (input.contentType) {
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/webp":
      return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && ascii(bytes, 8, 4) === "WEBP";
    case "image/heic":
    case "image/heif": {
      if (!hasIsoMediaSignature(bytes)) return false;
      const brand = ascii(bytes, 8, 4);
      return new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]).has(brand);
    }
    case "audio/webm":
    case "video/webm":
      return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
    case "audio/mp4":
      return hasFragmentedVoiceIsoMediaSignature(bytes);
    case "video/mp4":
      return input.kind === "voice" ? hasFragmentedVoiceIsoMediaSignature(bytes) : hasIsoMediaSignature(bytes);
    case "video/quicktime":
      return hasIsoMediaSignature(bytes);
    case "audio/ogg":
      return ascii(bytes, 0, 4) === "OggS";
    case "audio/mpeg":
      return ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && bytes.length > 1 && (bytes[1]! & 0xe0) === 0xe0);
    case "audio/aac":
      return bytes[0] === 0xff && bytes.length > 1 && (bytes[1]! & 0xf6) === 0xf0;
    case "audio/wav":
    case "audio/x-wav":
      return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE";
    case "application/pdf":
      return ascii(bytes, 0, 5) === "%PDF-";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return hasZipSignature(bytes);
    default:
      return false;
  }
}

type CommunityObjectMetadata = {
  key: string;
  contentType: string | null;
  sizeBytes: number | null;
  etag?: string | null;
  versionId?: string | null;
};

type CommunityObjectValidationError =
  | "foreign_object"
  | "expired_intent"
  | "object_already_consumed"
  | "metadata_mismatch"
  | "signature_mismatch";

export function validateCommunityObject({
  uploaded,
  userId,
  metadata,
  leadingBytes,
  expiresAt,
  now = new Date(),
  consumed
}: {
  uploaded: CommunityUploadedObject;
  userId: string;
  metadata: CommunityObjectMetadata;
  leadingBytes: Uint8Array;
  expiresAt: Date;
  now?: Date;
  consumed: boolean;
}): { ok: true; value: CommunityUploadedObject } | { ok: false; error: CommunityObjectValidationError } {
  const expectedPrefix = `community/pending/${sanitizeKeyPart(userId)}/`;
  const tokenMarker = `/${sanitizeKeyPart(uploaded.uploadToken)}-`;
  if (!uploaded.objectKey.startsWith(expectedPrefix) || !uploaded.objectKey.includes(tokenMarker)) {
    return { ok: false, error: "foreign_object" };
  }
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() < now.getTime()) {
    return { ok: false, error: "expired_intent" };
  }
  if (consumed) return { ok: false, error: "object_already_consumed" };
  if (
    metadata.key !== uploaded.objectKey ||
    metadata.contentType !== uploaded.contentType ||
    metadata.sizeBytes !== uploaded.sizeBytes ||
    metadata.sizeBytes === null ||
    metadata.sizeBytes <= 0
  ) {
    return { ok: false, error: "metadata_mismatch" };
  }
  if (!validateCommunitySignature(uploaded, leadingBytes)) {
    return { ok: false, error: "signature_mismatch" };
  }
  return { ok: true, value: uploaded };
}

export function validateMultipartCompletion({
  sizeBytes,
  partSizeBytes,
  parts
}: {
  sizeBytes: number;
  partSizeBytes: number;
  parts: Array<{ partNumber: number; etag: string }>;
}): { ok: true } | { ok: false; error: "invalid_part_size" | "missing_parts" | "duplicate_part" | "too_many_parts" | "invalid_part" } {
  if (!Number.isInteger(partSizeBytes) || partSizeBytes !== communityMultipartPartSizeBytes) {
    return { ok: false, error: "invalid_part_size" };
  }
  const expectedCount = Math.ceil(sizeBytes / partSizeBytes);
  if (expectedCount > communityMaxMultipartParts || parts.length > expectedCount) {
    return { ok: false, error: "too_many_parts" };
  }
  const seen = new Set<number>();
  for (const part of parts) {
    if (seen.has(part.partNumber)) return { ok: false, error: "duplicate_part" };
    if (!Number.isInteger(part.partNumber) || part.partNumber < 1 || part.partNumber > expectedCount || !part.etag.trim()) {
      return { ok: false, error: "invalid_part" };
    }
    seen.add(part.partNumber);
  }
  if (parts.length !== expectedCount) return { ok: false, error: "missing_parts" };
  return { ok: true };
}

export function validateListedMultipartParts({
  sizeBytes,
  partSizeBytes,
  submitted,
  listed
}: {
  sizeBytes: number;
  partSizeBytes: number;
  submitted: Array<{ partNumber: number; etag: string }>;
  listed: Array<{ partNumber: number; etag: string; sizeBytes: number }>;
}): { ok: true } | { ok: false; error: "part_count_mismatch" | "part_size_mismatch" | "part_etag_mismatch" } {
  if (listed.length !== submitted.length) return { ok: false, error: "part_count_mismatch" };
  const submittedByNumber = new Map(submitted.map((part) => [part.partNumber, part]));
  const listedNumbers = new Set<number>();
  const normalizedEtag = (value: string) => value.trim().replace(/^W\//i, "").replace(/^\"|\"$/g, "");
  for (const part of listed) {
    if (listedNumbers.has(part.partNumber) || part.partNumber < 1 || part.partNumber > submitted.length) {
      return { ok: false, error: "part_count_mismatch" };
    }
    listedNumbers.add(part.partNumber);
    const expectedSize = part.partNumber === submitted.length
      ? sizeBytes - partSizeBytes * (submitted.length - 1)
      : partSizeBytes;
    if (part.sizeBytes !== expectedSize) return { ok: false, error: "part_size_mismatch" };
    const submittedPart = submittedByNumber.get(part.partNumber);
    if (!submittedPart || normalizedEtag(submittedPart.etag) !== normalizedEtag(part.etag)) {
      return { ok: false, error: "part_etag_mismatch" };
    }
  }
  return listedNumbers.size === submitted.length ? { ok: true } : { ok: false, error: "part_count_mismatch" };
}

type CommunityUploadRegistryRecord = {
  userId: string;
  uploadToken: string;
  objectKey: string;
  fingerprint: string;
  expiresAt: Date;
  uploadType: "put" | "multipart";
  multipartUploadId: string | null;
  expectedPartCount: number | null;
  partSizeBytes: number | null;
  kind: CommunityUploadIntent["kind"];
  fileName: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
};

type CommunityUploadClaim =
  | {
      ok: true;
      intent: {
        stagingObjectKey: string;
        uploadType: "put" | "multipart";
        multipartUploadId: string | null;
        expectedPartCount: number | null;
        partSizeBytes: number | null;
      };
    }
  | { ok: true; replay: CommunityUploadResult }
  | { ok: false; error: "foreign_object" | "expired_intent" | "object_already_consumed" | "intent_mismatch" };

export type CommunityUploadResult = CommunityUploadedObject & {
  scanStatus: "processing" | "pending" | "ready" | "failed" | "rejected";
  width?: number;
  height?: number;
};

type CommunityUploadServiceDependencies = {
  issue: (record: CommunityUploadRegistryRecord) => Promise<void>;
  claim: (record: { userId: string; uploadToken: string; fingerprint: string; now: Date }) => Promise<CommunityUploadClaim>;
  finish: (record: {
    userId: string;
    uploadToken: string;
    fingerprint: string;
    result: CommunityUploadResult;
    status: "processing" | "pending" | "ready";
    expiresAt: Date;
  }, publicationScope?: unknown) => Promise<"finished" | "cancelled">;
  fail: (record: { userId: string; uploadToken: string; fingerprint: string }, error: string) => Promise<void>;
  recordPromotion: (record: {
    userId: string;
    uploadToken: string;
    fingerprint: string;
    destinationKey: string;
    destination: "final" | "quarantine";
  }) => Promise<
    | { status: "recorded"; publication: CommunityObjectPublicationClaim }
    | { status: "cancelled" }
  >;
  publishPromotion: <Written, Result>(
    publication: CommunityObjectPublicationClaim,
    work: {
      write: (signal: AbortSignal) => Promise<Written>;
      commit: (publicationScope: unknown, written: Written) => Promise<Result>;
    }
  ) => Promise<Result>;
  markCleanupPending: (
    record: { userId: string; uploadToken: string; fingerprint: string },
    error: string
  ) => Promise<void>;
  completeCancelledCleanup: (record: { userId: string; uploadToken: string; fingerprint: string }) => Promise<void>;
  createPutUrl: (input: { key: string; contentType: string; sizeBytes: number; expiresInSeconds: number }) => Promise<{
    key: string;
    uploadUrl: string;
    expiresAt: Date;
  }>;
  createMultipart: (input: { key: string; contentType: string; partsCount: number; expiresInSeconds: number }) => Promise<{
    key: string;
    uploadId: string;
    parts: Array<{ partNumber: number }>;
    expiresAt: Date;
  }>;
  createPartUrl: (input: { key: string; uploadId: string; partNumber: number; expiresInSeconds: number }) => Promise<string>;
  completeMultipart: (input: { key: string; uploadId: string; parts: Array<{ partNumber: number; etag: string }> }) => Promise<{ key: string }>;
  abortMultipart: (input: { key: string; uploadId: string }) => Promise<void>;
  listParts: (input: { key: string; uploadId: string }) => Promise<Array<{ partNumber: number; etag: string; sizeBytes: number }>>;
  getMetadata: (key: string, signal?: AbortSignal) => Promise<CommunityObjectMetadata>;
  getLeadingBytes: (key: string, maxBytes: number, expectedETag?: string) => Promise<Uint8Array>;
  validateOoxml: (input: CommunityUploadedObject, metadata: CommunityObjectMetadata) => Promise<boolean>;
  promoteObject: (input: {
    sourceKey: string;
    destinationKey: string;
    expectedETag: string;
    contentType: string;
  }, signal?: AbortSignal) => Promise<void>;
  mirrorToReserve: (key: string, contentType: string, signal?: AbortSignal) => Promise<void>;
  deleteCopies: (key: string) => Promise<void>;
  deleteStaging: (key: string) => Promise<void>;
};

export function getCommunityUploadFingerprint(uploaded: CommunityUploadedObject) {
  return createHash("sha256")
    .update(JSON.stringify({
      kind: uploaded.kind,
      fileName: uploaded.fileName,
      contentType: uploaded.contentType,
      sizeBytes: uploaded.sizeBytes,
      durationSeconds: uploaded.kind === "voice" ? uploaded.durationSeconds : null,
      objectKey: uploaded.objectKey,
      uploadToken: uploaded.uploadToken
    }))
    .digest("hex");
}

function completedObject(input: CommunityUploadIntent, uploadToken: string, objectKey: string): CommunityUploadedObject {
  return { ...input, uploadToken, objectKey } as CommunityUploadedObject;
}

function buildCommunityDestinationObjectKey({
  prefix,
  userId,
  uploadToken,
  fileName,
  now = new Date()
}: {
  prefix: "candidates" | "final" | "quarantine";
  userId: string;
  uploadToken: string;
  fileName: string;
  now?: Date;
}) {
  return `community/${prefix}/${sanitizeKeyPart(userId)}/${now.toISOString().slice(0, 10)}/${sanitizeKeyPart(uploadToken)}-${sanitizeKeyPart(fileName)}`;
}

export function buildCommunityFinalObjectKey(input: Omit<Parameters<typeof buildCommunityDestinationObjectKey>[0], "prefix">) {
  return buildCommunityDestinationObjectKey({ ...input, prefix: "final" });
}

export function buildCommunityCandidateObjectKey(input: Omit<Parameters<typeof buildCommunityDestinationObjectKey>[0], "prefix">) {
  return buildCommunityDestinationObjectKey({ ...input, prefix: "candidates" });
}

export function buildCommunityQuarantineObjectKey(input: Omit<Parameters<typeof buildCommunityDestinationObjectKey>[0], "prefix">) {
  return buildCommunityDestinationObjectKey({ ...input, prefix: "quarantine" });
}

export function createCommunityUploadService(dependencies: CommunityUploadServiceDependencies) {
  async function claim(userId: string, uploaded: CommunityUploadedObject, now: Date) {
    const fingerprint = getCommunityUploadFingerprint(uploaded);
    const result = await dependencies.claim({ userId, uploadToken: uploaded.uploadToken, fingerprint, now });
    if (!result.ok) throw new Error(result.error);
    return { fingerprint, result };
  }

  async function verifyClaimedObject(
    userId: string,
    uploaded: CommunityUploadedObject,
    fingerprint: string,
    intent: Extract<CommunityUploadClaim, { intent: unknown }>["intent"],
    now: Date
  ) {
    let failureRecorded = false;
    let finishAttempted = false;
    let promotionCompleted = false;
    let ownershipLost = false;
    const destinationKey = uploaded.kind === "video"
      ? buildCommunityFinalObjectKey({ userId, uploadToken: uploaded.uploadToken, fileName: uploaded.fileName, now })
      : buildCommunityQuarantineObjectKey({ userId, uploadToken: uploaded.uploadToken, fileName: uploaded.fileName, now });
    try {
      if (intent.stagingObjectKey !== uploaded.objectKey) throw new Error("intent_mismatch");
      const metadata = await dependencies.getMetadata(intent.stagingObjectKey);
      if (!metadata.etag) throw new Error("metadata_mismatch");
      const sourceETag = metadata.etag;
      const leadingBytes = await dependencies.getLeadingBytes(intent.stagingObjectKey, communitySignaturePrefixBytes, sourceETag);
      const validation = validateCommunityObject({
        uploaded,
        userId,
        metadata,
        leadingBytes,
        expiresAt: new Date(now.getTime() + 1),
        now,
        consumed: false
      });
      if (!validation.ok) {
        await dependencies.deleteStaging(intent.stagingObjectKey).catch(() => undefined);
        await dependencies.fail({ userId, uploadToken: uploaded.uploadToken, fingerprint }, validation.error);
        failureRecorded = true;
        throw new Error(validation.error);
      }
      if (uploaded.kind === "document" && uploaded.contentType !== "application/pdf" && !(await dependencies.validateOoxml(uploaded, metadata))) {
        await dependencies.deleteStaging(intent.stagingObjectKey).catch(() => undefined);
        await dependencies.fail({ userId, uploadToken: uploaded.uploadToken, fingerprint }, "invalid_ooxml");
        failureRecorded = true;
        throw new Error("invalid_ooxml");
      }
      const promotionRecord = await dependencies.recordPromotion({
        userId,
        uploadToken: uploaded.uploadToken,
        fingerprint,
        destinationKey,
        destination: uploaded.kind === "video" ? "final" : "quarantine"
      });
      if (promotionRecord.status === "cancelled") {
        ownershipLost = true;
        throw new Error("object_already_consumed");
      }
      const status = uploaded.kind === "video" ? "ready" : uploaded.kind === "document" ? "pending" : "processing";
      const result = { ...validation.value, objectKey: destinationKey, scanStatus: status } as CommunityUploadResult;
      await dependencies.publishPromotion(promotionRecord.publication, {
        write: async (signal) => {
          await dependencies.promoteObject({
            sourceKey: intent.stagingObjectKey,
            destinationKey,
            expectedETag: sourceETag,
            contentType: uploaded.contentType
          }, signal);
          promotionCompleted = true;
          const promoted = await dependencies.getMetadata(destinationKey, signal);
          if (promoted.key !== destinationKey || promoted.contentType !== uploaded.contentType || promoted.sizeBytes !== uploaded.sizeBytes) {
            throw new Error("promotion_mismatch");
          }
          if (status === "ready") await dependencies.mirrorToReserve(destinationKey, uploaded.contentType, signal);
          return result;
        },
        commit: async (publicationScope, publishedResult) => {
          finishAttempted = true;
          const finishState = await dependencies.finish({
            userId,
            uploadToken: uploaded.uploadToken,
            fingerprint,
            result: publishedResult,
            status,
            expiresAt: new Date(now.getTime() + communityCompletedUploadAttachmentGraceMs)
          }, publicationScope);
          if (finishState === "cancelled") {
            throw new Error("object_already_consumed");
          }
        }
      });
      await dependencies.deleteStaging(intent.stagingObjectKey).catch(() => undefined);
      return result;
    } catch (error) {
      if (ownershipLost) throw error;
      if (!failureRecorded && !finishAttempted) {
        await dependencies.deleteCopies(destinationKey).catch(() => undefined);
        await dependencies.deleteStaging(intent.stagingObjectKey).catch(() => undefined);
        await dependencies.fail({ userId, uploadToken: uploaded.uploadToken, fingerprint }, "storage_verification_failed").catch(() => undefined);
      } else if (!failureRecorded && finishAttempted && promotionCompleted && error instanceof Error && error.message === "object_already_consumed") {
        const cleanupFailures: unknown[] = [];
        await dependencies.deleteCopies(destinationKey).catch((cleanupError) => { cleanupFailures.push(cleanupError); });
        await dependencies.deleteStaging(intent.stagingObjectKey).catch((cleanupError) => { cleanupFailures.push(cleanupError); });
        if (cleanupFailures.length) {
          try {
            await dependencies.markCleanupPending(
              { userId, uploadToken: uploaded.uploadToken, fingerprint },
              "abort_compensation_failed"
            );
          } catch (ledgerError) {
            throw new AggregateError([...cleanupFailures, ledgerError], "Unable to persist community upload cleanup retry");
          }
        } else {
          await dependencies.completeCancelledCleanup({ userId, uploadToken: uploaded.uploadToken, fingerprint });
        }
      }
      throw error;
    }
  }

  return {
    async createIntent({
      userId,
      input,
      now = new Date(),
      tokenFactory = randomUUID
    }: {
      userId: string;
      input: CommunityUploadIntent;
      now?: Date;
      tokenFactory?: () => string;
    }) {
      const policyError = getCommunityUploadError(input);
      if (policyError) throw new Error(policyError);
      const uploadToken = tokenFactory();
      const objectKey = buildCommunityPendingObjectKey({ userId, uploadToken, fileName: input.fileName, now });
      const object = completedObject(input, uploadToken, objectKey);
      const fingerprint = getCommunityUploadFingerprint(object);
      const expiresInSeconds = communityUploadIntentTtlMs / 1000;

      if (input.sizeBytes <= communityDirectPutMaxBytes) {
        const upload = await dependencies.createPutUrl({ key: objectKey, contentType: input.contentType, sizeBytes: input.sizeBytes, expiresInSeconds });
        await dependencies.issue({
          userId,
          uploadToken,
          objectKey: upload.key,
          fingerprint,
          expiresAt: upload.expiresAt,
          uploadType: "put",
          multipartUploadId: null,
          expectedPartCount: null,
          partSizeBytes: null,
          kind: input.kind,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          durationSeconds: input.kind === "voice" ? input.durationSeconds : null
        });
        return {
          ...input,
          uploadType: "put" as const,
          objectKey: upload.key,
          uploadToken,
          uploadUrl: upload.uploadUrl,
          expiresAt: upload.expiresAt.toISOString()
        };
      }

      const partsCount = Math.ceil(input.sizeBytes / communityMultipartPartSizeBytes);
      if (partsCount > communityMaxMultipartParts) throw new Error("too_many_parts");
      const upload = await dependencies.createMultipart({
        key: objectKey,
        contentType: input.contentType,
        partsCount,
        expiresInSeconds
      });
      try {
        const parts = await Promise.all(upload.parts.map(async ({ partNumber }) => ({
          partNumber,
          uploadUrl: await dependencies.createPartUrl({
            key: upload.key,
            uploadId: upload.uploadId,
            partNumber,
            expiresInSeconds
          })
        })));
        await dependencies.issue({
          userId,
          uploadToken,
          objectKey: upload.key,
          fingerprint,
          expiresAt: upload.expiresAt,
          uploadType: "multipart",
          multipartUploadId: upload.uploadId,
          expectedPartCount: partsCount,
          partSizeBytes: communityMultipartPartSizeBytes,
          kind: input.kind,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          durationSeconds: input.kind === "voice" ? input.durationSeconds : null
        });
        return {
          ...input,
          uploadType: "multipart" as const,
          objectKey: upload.key,
          uploadToken,
          uploadId: upload.uploadId,
          partSizeBytes: communityMultipartPartSizeBytes,
          parts,
          expiresAt: upload.expiresAt.toISOString()
        };
      } catch (error) {
        await dependencies.abortMultipart({ key: upload.key, uploadId: upload.uploadId }).catch(() => undefined);
        throw error;
      }
    },

    async completePut({ userId, uploaded, now = new Date() }: { userId: string; uploaded: CommunityUploadedObject; now?: Date }) {
      const policyError = getCommunityUploadError(uploaded);
      if (policyError) throw new Error(policyError);
      if (uploaded.sizeBytes > communityDirectPutMaxBytes) throw new Error("multipart_required");
      const claimed = await claim(userId, uploaded, now);
      if ("replay" in claimed.result) return claimed.result.replay;
      if (claimed.result.intent.uploadType !== "put") throw new Error("intent_mismatch");
      return verifyClaimedObject(userId, uploaded, claimed.fingerprint, claimed.result.intent, now);
    },

    async completeMultipartUpload({
      userId,
      uploaded,
      uploadId,
      partSizeBytes,
      parts,
      now = new Date()
    }: {
      userId: string;
      uploaded: CommunityUploadedObject;
      uploadId: string;
      partSizeBytes: number;
      parts: Array<{ partNumber: number; etag: string }>;
      now?: Date;
    }) {
      const policyError = getCommunityUploadError(uploaded);
      if (policyError) throw new Error(policyError);
      if (uploaded.sizeBytes <= communityDirectPutMaxBytes) throw new Error("put_required");
      const partsValidation = validateMultipartCompletion({ sizeBytes: uploaded.sizeBytes, partSizeBytes, parts });
      if (!partsValidation.ok) throw new Error(partsValidation.error);
      const claimed = await claim(userId, uploaded, now);
      if ("replay" in claimed.result) return claimed.result.replay;
      const intent = claimed.result.intent;
      if (
        intent.uploadType !== "multipart" ||
        intent.multipartUploadId !== uploadId ||
        intent.expectedPartCount !== parts.length ||
        intent.partSizeBytes !== partSizeBytes
      ) throw new Error("intent_mismatch");
      const listed = await dependencies.listParts({ key: intent.stagingObjectKey, uploadId });
      const listedValidation = validateListedMultipartParts({ sizeBytes: uploaded.sizeBytes, partSizeBytes, submitted: parts, listed });
      if (!listedValidation.ok) {
        await dependencies.abortMultipart({ key: intent.stagingObjectKey, uploadId }).catch(() => undefined);
        await dependencies.fail({ userId, uploadToken: uploaded.uploadToken, fingerprint: claimed.fingerprint }, listedValidation.error);
        throw new Error(listedValidation.error);
      }
      try {
        await dependencies.completeMultipart({ key: intent.stagingObjectKey, uploadId, parts });
      } catch (error) {
        const reconciled = await dependencies.getMetadata(intent.stagingObjectKey).catch(() => null);
        if (reconciled?.contentType !== uploaded.contentType || reconciled.sizeBytes !== uploaded.sizeBytes) {
          await dependencies.abortMultipart({ key: intent.stagingObjectKey, uploadId }).catch(() => undefined);
          await dependencies.fail({ userId, uploadToken: uploaded.uploadToken, fingerprint: claimed.fingerprint }, "multipart_completion_failed");
          throw error;
        }
      }
      return verifyClaimedObject(userId, uploaded, claimed.fingerprint, intent, now);
    }
  };
}
