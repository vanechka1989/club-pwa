import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { and, asc, eq, inArray, isNotNull, lte, or } from "drizzle-orm";
import sharp from "sharp";
import { communityMediaCleanupPolicy } from "./cleanupPolicy";
import { buildCommunityCandidateObjectKey, buildCommunityFinalObjectKey } from "./directUpload";

const execFileAsync = promisify(execFile);
export const communityVoiceDurationToleranceSeconds = 0.5;
export const communityVoiceConversionConcurrency = 2;

let activeVoiceConversions = 0;
const pendingVoiceConversions: Array<() => void> = [];

async function withVoiceConversionPermit<T>(work: () => Promise<T>) {
  if (activeVoiceConversions >= communityVoiceConversionConcurrency) {
    await new Promise<void>((resolvePermit) => pendingVoiceConversions.push(resolvePermit));
  }
  activeVoiceConversions += 1;
  try {
    return await work();
  } finally {
    activeVoiceConversions -= 1;
    pendingVoiceConversions.shift()?.();
  }
}

type MediaManifest = {
  id: string;
  userId: string;
  uploadToken: string;
  kind: "image" | "voice";
  quarantineObjectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  leaseToken?: string;
};

type MediaCandidateResult = {
  candidateObjectKey: string;
  finalObjectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
};

type MediaProcessorDependencies = {
  withWorkspace: <T>(work: (paths: { inputPath: string; outputPath: string }) => Promise<T>) => Promise<T>;
  downloadToFile: (key: string, path: string, maxBytes: number) => Promise<void>;
  normalizeImageFile: (inputPath: string, outputPath: string, fileName: string) => Promise<{
    fileName: string;
    contentType: string;
    sizeBytes: number;
    width: number;
    height: number;
  }>;
  probeDuration: (path: string) => Promise<number>;
  transcodeVoiceFile: (inputPath: string, outputPath: string) => Promise<void>;
  uploadFile: (input: { key: string; path: string; contentType: string }) => Promise<{ sizeBytes: number } | void>;
  mirrorToReserve: (key: string, contentType: string) => Promise<void>;
  deleteCopies: (key: string) => Promise<void>;
  registerCandidate: (manifestId: string, result: MediaCandidateResult) => Promise<void>;
  cleanupCandidate: (manifestId: string, candidateObjectKey: string) => Promise<void>;
  complete: (manifestId: string, result: MediaCandidateResult) => Promise<void>;
  fail: (manifestId: string, errorCode: string) => Promise<boolean | void>;
};

export function shouldProcessCommunityMediaManifest(manifest: { status: string; attachmentId: string | null }) {
  return Boolean(manifest.attachmentId && ["processing", "normalizing"].includes(manifest.status));
}

function safeStem(fileName: string) {
  return basename(fileName).replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 100) || "media";
}

function buildLeaseUniqueObjectKeys(manifest: MediaManifest, fileName: string) {
  const input = {
    userId: manifest.userId,
    uploadToken: manifest.leaseToken ? `${manifest.uploadToken}-${manifest.leaseToken}` : manifest.uploadToken,
    fileName
  };
  return {
    candidateObjectKey: buildCommunityCandidateObjectKey(input),
    finalObjectKey: buildCommunityFinalObjectKey(input)
  };
}

type CleanupCandidate = {
  id: string;
  candidateObjectKey: string;
  finalObjectKey: string;
  status: "staged" | "cleanup_pending" | "published_cleanup_pending" | "publishing" | "published" | "cleaned";
  updatedAt: Date;
  manifestStatus: string;
  leaseUpdatedAt: Date;
  manifestUpdatedAt: Date;
};

type CleanupCandidateDependencies = {
  claim: (candidate: CleanupCandidate) => Promise<boolean>;
  deleteCopies: (key: string) => Promise<unknown>;
  markComplete: (id: string, status: "cleaned" | "published") => Promise<unknown>;
  markRetry: (id: string, errorCode: string) => Promise<unknown>;
};

export async function cleanupCommunityMediaCandidate(candidate: CleanupCandidate, dependencies: CleanupCandidateDependencies) {
  if (candidate.status === "publishing" || candidate.status === "published" || candidate.status === "cleaned") return "skipped" as const;
  const leaseIsCurrent = candidate.status === "staged"
    && candidate.manifestStatus === "normalizing"
    && candidate.leaseUpdatedAt.getTime() === candidate.manifestUpdatedAt.getTime();
  if (leaseIsCurrent || !await dependencies.claim(candidate)) return "skipped" as const;
  try {
    const keys = candidate.status === "published_cleanup_pending"
      ? [candidate.candidateObjectKey]
      : [candidate.candidateObjectKey, candidate.finalObjectKey];
    for (const key of new Set(keys)) await dependencies.deleteCopies(key);
    await dependencies.markComplete(candidate.id, candidate.status === "published_cleanup_pending" ? "published" : "cleaned");
    return "cleaned" as const;
  } catch (error) {
    const errorCode = error instanceof Error ? error.message.slice(0, 160) : "candidate_cleanup_failed";
    await dependencies.markRetry(candidate.id, errorCode);
    return "retry" as const;
  }
}

export function getCommunityMediaCandidateRecoveryAction(
  candidate: Pick<CleanupCandidate, "finalObjectKey" | "status">,
  manifest: { status: string; finalObjectKey: string | null; attachmentId?: string | null } | null
) {
  if (candidate.status !== "publishing") return "cleanup" as const;
  if (manifest?.status === "ready" && manifest.finalObjectKey === candidate.finalObjectKey) return "cleanup_candidate" as const;
  if (manifest?.status === "publishing" && manifest.attachmentId) return "publish" as const;
  return "discard" as const;
}

export async function processCommunityMediaManifest(manifest: MediaManifest, dependencies: MediaProcessorDependencies) {
  let candidateObjectKey: string | null = null;
  let candidateRegistered = false;
  let completeAttempted = false;
  try {
    return await dependencies.withWorkspace(async ({ inputPath, outputPath }) => {
      await dependencies.downloadToFile(manifest.quarantineObjectKey, inputPath, manifest.sizeBytes);
      if (manifest.kind === "voice") {
        const outputDuration = await withVoiceConversionPermit(async () => {
          const inputDuration = await dependencies.probeDuration(inputPath);
          if (!Number.isFinite(inputDuration) || inputDuration <= 0 || inputDuration > 300 + communityVoiceDurationToleranceSeconds) {
            throw new Error("voice_duration_exceeded");
          }
          await dependencies.transcodeVoiceFile(inputPath, outputPath);
          const measuredOutputDuration = await dependencies.probeDuration(outputPath);
          if (!Number.isFinite(measuredOutputDuration) || measuredOutputDuration <= 0 || measuredOutputDuration > 300 + communityVoiceDurationToleranceSeconds) {
            throw new Error("voice_duration_exceeded");
          }
          return measuredOutputDuration;
        });
        const fileName = `${safeStem(manifest.fileName)}.m4a`;
        const objectKeys = buildLeaseUniqueObjectKeys(manifest, fileName);
        candidateObjectKey = objectKeys.candidateObjectKey;
        const result: MediaCandidateResult = {
          ...objectKeys,
          fileName,
          contentType: "audio/mp4",
          sizeBytes: manifest.sizeBytes,
          durationSeconds: Math.min(300, Math.max(1, Math.ceil(outputDuration))),
          width: null,
          height: null
        };
        await dependencies.registerCandidate(manifest.id, result);
        candidateRegistered = true;
        const upload = await dependencies.uploadFile({ key: candidateObjectKey, path: outputPath, contentType: "audio/mp4" });
        result.sizeBytes = upload?.sizeBytes ?? manifest.sizeBytes;
        await dependencies.mirrorToReserve(candidateObjectKey, "audio/mp4");
        completeAttempted = true;
        await dependencies.complete(manifest.id, result);
        await dependencies.deleteCopies(manifest.quarantineObjectKey).catch(() => undefined);
        return "ready" as const;
      }

      const normalized = await dependencies.normalizeImageFile(inputPath, outputPath, manifest.fileName);
      const objectKeys = buildLeaseUniqueObjectKeys(manifest, normalized.fileName);
      candidateObjectKey = objectKeys.candidateObjectKey;
      const result: MediaCandidateResult = {
        ...objectKeys,
        fileName: normalized.fileName,
        contentType: normalized.contentType,
        sizeBytes: normalized.sizeBytes,
        durationSeconds: null,
        width: normalized.width,
        height: normalized.height
      };
      await dependencies.registerCandidate(manifest.id, result);
      candidateRegistered = true;
      const upload = await dependencies.uploadFile({ key: candidateObjectKey, path: outputPath, contentType: normalized.contentType });
      result.sizeBytes = upload?.sizeBytes ?? normalized.sizeBytes;
      await dependencies.mirrorToReserve(candidateObjectKey, normalized.contentType);
      completeAttempted = true;
      await dependencies.complete(manifest.id, result);
      await dependencies.deleteCopies(manifest.quarantineObjectKey).catch(() => undefined);
      return "ready" as const;
    });
  } catch (error) {
    if (completeAttempted) {
      if (manifest.leaseToken && candidateObjectKey && error instanceof Error && error.message === "manifest_lease_lost") {
        await dependencies.cleanupCandidate(manifest.id, candidateObjectKey).catch(() => undefined);
      }
      throw error;
    }
    const errorCode = error instanceof Error && error.message === "voice_duration_exceeded"
      ? "voice_duration_exceeded"
      : "media_processing_failed";
    const failed = await dependencies.fail(manifest.id, errorCode);
    if (candidateRegistered && candidateObjectKey) {
      await dependencies.cleanupCandidate(manifest.id, candidateObjectKey).catch(() => undefined);
    }
    if (failed === false) return "lease_lost" as const;
    await dependencies.deleteCopies(manifest.quarantineObjectKey).catch(() => undefined);
    return "failed" as const;
  }
}

export async function probeCommunityMediaDuration(path: string) {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "json",
    path
  ], { timeout: 15_000, killSignal: "SIGKILL", maxBuffer: 64 * 1024 });
  const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
  const duration = Number(parsed.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("invalid_media_duration");
  return duration;
}

async function productionWorkspace<T>(work: (paths: { inputPath: string; outputPath: string }) => Promise<T>) {
  const { env } = await import("../env");
  const directory = await mkdtemp(join(env.UPLOADS_DIR, "community-worker-"));
  try {
    return await work({ inputPath: join(directory, "input.media"), outputPath: join(directory, "output.media") });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function normalizeImageFile(inputPath: string, outputPath: string, fileName: string) {
  const image = sharp(inputPath, { limitInputPixels: 40_000_000, pages: 1, sequentialRead: true, failOn: "warning" })
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .timeout({ seconds: 60 });
  const info = await image.toFile(outputPath);
  if (!info.width || !info.height || info.size < 1 || info.size > 15 * 1024 * 1024) throw new Error("invalid_normalized_image");
  return {
    fileName: `${safeStem(fileName)}.webp`,
    contentType: "image/webp",
    sizeBytes: info.size,
    width: info.width,
    height: info.height
  };
}

async function transcodeVoiceFile(inputPath: string, outputPath: string) {
  await execFileAsync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", inputPath,
    "-t", String(300 + communityVoiceDurationToleranceSeconds),
    "-vn", "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-ar", "48000",
    "-movflags", "+faststart", "-f", "mp4", outputPath
  ], { timeout: 60_000, killSignal: "SIGKILL", maxBuffer: 256 * 1024 });
}

function readMediaCandidateResult(value: unknown): MediaCandidateResult {
  const result = value as Partial<MediaCandidateResult> | null;
  if (!result
    || typeof result.candidateObjectKey !== "string"
    || !result.candidateObjectKey.startsWith("community/candidates/")
    || typeof result.finalObjectKey !== "string"
    || !result.finalObjectKey.startsWith("community/final/")
    || typeof result.fileName !== "string"
    || typeof result.contentType !== "string"
    || typeof result.sizeBytes !== "number") {
    throw new Error("invalid_media_candidate_result");
  }
  return {
    candidateObjectKey: result.candidateObjectKey,
    finalObjectKey: result.finalObjectKey,
    fileName: result.fileName,
    contentType: result.contentType,
    sizeBytes: result.sizeBytes,
    durationSeconds: typeof result.durationSeconds === "number" ? result.durationSeconds : null,
    width: typeof result.width === "number" ? result.width : null,
    height: typeof result.height === "number" ? result.height : null
  };
}

async function publishAndFinalizeCommunityMediaCandidateAttempt(manifest: {
  id: string;
  kind: string;
  uploadToken: string;
}, result: MediaCandidateResult) {
  const [{ db }, { clubMessageAttachments, communityMediaCandidates, communityUploadManifests }, storage] = await Promise.all([
    import("../db/client"),
    import("../db/schema"),
    import("../storage/s3")
  ]);
  const metadata = await storage.getObjectMetadata(result.candidateObjectKey);
  if (!metadata.etag) throw new Error("candidate_etag_missing");
  await storage.promoteObjectVersion({
    sourceKey: result.candidateObjectKey,
    destinationKey: result.finalObjectKey,
    expectedETag: metadata.etag,
    contentType: result.contentType
  });
  await storage.mirrorObjectToReserve(result.finalObjectKey, result.contentType);

  await db.transaction(async (transaction) => {
    const database = transaction as unknown as typeof db;
    const completedAt = new Date();
    const [candidate] = await database.update(communityMediaCandidates).set({
      status: "published_cleanup_pending",
      errorCode: null,
      updatedAt: completedAt
    }).where(and(
      eq(communityMediaCandidates.manifestId, manifest.id),
      eq(communityMediaCandidates.candidateObjectKey, result.candidateObjectKey),
      eq(communityMediaCandidates.status, "publishing")
    )).returning({ id: communityMediaCandidates.id });
    if (!candidate) throw new Error("candidate_publish_lost");

    const [completed] = await database.update(communityUploadManifests).set({
      finalObjectKey: result.finalObjectKey,
      quarantineObjectKey: null,
      result: {
        kind: manifest.kind,
        fileName: result.fileName,
        contentType: result.contentType,
        sizeBytes: result.sizeBytes,
        ...(manifest.kind === "voice" ? { durationSeconds: result.durationSeconds } : {}),
        ...(manifest.kind === "image" ? { width: result.width, height: result.height } : {}),
        uploadToken: manifest.uploadToken,
        objectKey: result.finalObjectKey,
        scanStatus: "ready"
      },
      status: "ready",
      errorCode: null,
      updatedAt: completedAt
    }).where(and(
      eq(communityUploadManifests.id, manifest.id),
      eq(communityUploadManifests.status, "publishing"),
      isNotNull(communityUploadManifests.attachmentId)
    )).returning({ attachmentId: communityUploadManifests.attachmentId });
    if (!completed?.attachmentId) throw new Error("candidate_publish_lost");
    await database.update(clubMessageAttachments).set({
      objectKey: result.finalObjectKey,
      fileName: result.fileName,
      contentType: result.contentType,
      sizeBytes: result.sizeBytes,
      durationSeconds: result.durationSeconds,
      width: result.width,
      height: result.height,
      scanStatus: "ready",
      scanError: null,
      scannedAt: completedAt
    }).where(eq(clubMessageAttachments.id, completed.attachmentId));
  });

  try {
    await storage.deleteObjectCopies(result.candidateObjectKey);
    await db.update(communityMediaCandidates).set({ status: "published", errorCode: null, updatedAt: new Date() })
      .where(and(
        eq(communityMediaCandidates.manifestId, manifest.id),
        eq(communityMediaCandidates.candidateObjectKey, result.candidateObjectKey),
        eq(communityMediaCandidates.status, "published_cleanup_pending")
      ));
  } catch (error) {
    const errorCode = error instanceof Error ? error.message.slice(0, 160) : "candidate_cleanup_failed";
    await db.update(communityMediaCandidates).set({ errorCode, updatedAt: new Date() })
      .where(and(
        eq(communityMediaCandidates.manifestId, manifest.id),
        eq(communityMediaCandidates.candidateObjectKey, result.candidateObjectKey),
        eq(communityMediaCandidates.status, "published_cleanup_pending")
      )).catch(() => undefined);
  }
}

async function reconcileCommunityMediaCandidateAfterPublishFailure(manifestId: string, result: MediaCandidateResult) {
  const [{ db }, { communityMediaCandidates, communityUploadManifests }] = await Promise.all([
    import("../db/client"),
    import("../db/schema")
  ]);
  const [candidate, manifest] = await Promise.all([
    db.query.communityMediaCandidates.findFirst({
      where: and(
        eq(communityMediaCandidates.manifestId, manifestId),
        eq(communityMediaCandidates.candidateObjectKey, result.candidateObjectKey)
      )
    }),
    db.query.communityUploadManifests.findFirst({
      where: eq(communityUploadManifests.id, manifestId),
      columns: { status: true, finalObjectKey: true, attachmentId: true }
    })
  ]);
  if (!candidate) return;
  if (candidate.status === "cleanup_pending" || candidate.status === "cleaned") {
    await requestCommunityMediaCandidateCleanup(manifestId, result.candidateObjectKey, true);
    return;
  }
  if (candidate.status === "published_cleanup_pending") {
    await requestCommunityMediaCandidateCleanup(manifestId, result.candidateObjectKey, false);
    return;
  }
  const action = getCommunityMediaCandidateRecoveryAction({
    finalObjectKey: candidate.finalObjectKey,
    status: candidate.status as CleanupCandidate["status"]
  }, manifest ?? null);
  if (action === "discard") await requestCommunityMediaCandidateCleanup(manifestId, result.candidateObjectKey, true);
  if (action === "cleanup_candidate") await requestCommunityMediaCandidateCleanup(manifestId, result.candidateObjectKey, false);
}

async function publishAndFinalizeCommunityMediaCandidate(manifest: {
  id: string;
  kind: string;
  uploadToken: string;
}, result: MediaCandidateResult) {
  try {
    await publishAndFinalizeCommunityMediaCandidateAttempt(manifest, result);
  } catch (error) {
    await reconcileCommunityMediaCandidateAfterPublishFailure(manifest.id, result).catch(() => undefined);
    throw error;
  }
}

async function cleanupPersistedCommunityMediaCandidate(candidate: CleanupCandidate) {
  const [{ db }, { communityMediaCandidates }, storage] = await Promise.all([
    import("../db/client"),
    import("../db/schema"),
    import("../storage/s3")
  ]);
  return cleanupCommunityMediaCandidate(candidate, {
    claim: async (current) => {
      const [claimed] = await db.update(communityMediaCandidates).set({ updatedAt: new Date() }).where(and(
        eq(communityMediaCandidates.id, current.id),
        eq(communityMediaCandidates.status, current.status),
        eq(communityMediaCandidates.updatedAt, current.updatedAt)
      )).returning({ id: communityMediaCandidates.id });
      return Boolean(claimed);
    },
    deleteCopies: storage.deleteObjectCopies,
    markComplete: (id, status) => db.update(communityMediaCandidates).set({ status, errorCode: null, updatedAt: new Date() })
      .where(eq(communityMediaCandidates.id, id)),
    markRetry: (id, errorCode) => db.update(communityMediaCandidates).set({ errorCode, updatedAt: new Date() })
      .where(eq(communityMediaCandidates.id, id))
  });
}

async function requestCommunityMediaCandidateCleanup(
  manifestId: string,
  candidateObjectKey: string,
  deleteUncommittedFinal = true
) {
  const [{ db }, { communityMediaCandidates, communityUploadManifests }] = await Promise.all([
    import("../db/client"),
    import("../db/schema")
  ]);
  const cleanupStatus = deleteUncommittedFinal ? "cleanup_pending" : "published_cleanup_pending";
  const sourceStatuses = deleteUncommittedFinal
    ? ["staged", "publishing", "cleanup_pending", "published_cleanup_pending", "published", "cleaned"]
    : ["publishing", "published_cleanup_pending"];
  await db.update(communityMediaCandidates).set({ status: cleanupStatus, updatedAt: new Date() }).where(and(
    eq(communityMediaCandidates.manifestId, manifestId),
    eq(communityMediaCandidates.candidateObjectKey, candidateObjectKey),
    inArray(communityMediaCandidates.status, sourceStatuses)
  ));
  const candidate = await db.query.communityMediaCandidates.findFirst({
    where: and(
      eq(communityMediaCandidates.manifestId, manifestId),
      eq(communityMediaCandidates.candidateObjectKey, candidateObjectKey),
      eq(communityMediaCandidates.status, cleanupStatus)
    )
  });
  if (!candidate) return;
  const currentManifest = await db.query.communityUploadManifests.findFirst({
    where: eq(communityUploadManifests.id, manifestId),
    columns: { status: true, updatedAt: true }
  });
  await cleanupPersistedCommunityMediaCandidate({
    ...candidate,
    status: candidate.status as CleanupCandidate["status"],
    manifestStatus: currentManifest?.status ?? "missing",
    manifestUpdatedAt: currentManifest?.updatedAt ?? new Date(0)
  });
}

export function loadCommunityMediaProcessorCandidates<T>(
  requestedLimit: number,
  list: (boundedLimit: number) => Promise<T[]>
) {
  return list(Math.min(Math.max(1, requestedLimit), 4));
}

export function loadCommunityMediaSweepCandidates<T>(
  requestedLimit: number,
  list: (boundedLimit: number) => Promise<T[]>
) {
  return list(Math.min(Math.max(1, requestedLimit), 50));
}

export async function runCommunityMediaProcessorBatch(limit = 4) {
  const [{ db }, { clubMessageAttachments, communityMediaCandidates, communityUploadManifests }, storage] = await Promise.all([
    import("../db/client"),
    import("../db/schema"),
    import("../storage/s3")
  ]);
  const manifests = await loadCommunityMediaProcessorCandidates(limit, (boundedLimit) =>
    db.query.communityUploadManifests.findMany({
      where: and(
        inArray(communityUploadManifests.kind, ["image", "voice"]),
        inArray(communityUploadManifests.status, ["processing", "normalizing"]),
        isNotNull(communityUploadManifests.attachmentId)
      ),
      orderBy: [asc(communityUploadManifests.createdAt)],
      limit: boundedLimit
    })
  );
  let processed = 0;
  for (const manifest of manifests) {
    if (!manifest.quarantineObjectKey || (manifest.kind !== "image" && manifest.kind !== "voice")) continue;
    const staleAt = new Date(Date.now() - 2 * 60 * 1000);
    const claimedAt = new Date();
    const leaseToken = randomUUID();
    const [claimed] = await db.update(communityUploadManifests)
      .set({ status: "normalizing", updatedAt: claimedAt })
      .where(and(
        eq(communityUploadManifests.id, manifest.id),
        isNotNull(communityUploadManifests.attachmentId),
        or(
          eq(communityUploadManifests.status, "processing"),
          and(eq(communityUploadManifests.status, "normalizing"), lte(communityUploadManifests.updatedAt, staleAt))
        )
      ))
      .returning({ id: communityUploadManifests.id, updatedAt: communityUploadManifests.updatedAt });
    if (!claimed) continue;
    await processCommunityMediaManifest({
      ...manifest,
      kind: manifest.kind,
      quarantineObjectKey: manifest.quarantineObjectKey,
      leaseToken
    }, {
      withWorkspace: productionWorkspace,
      downloadToFile: (key, path, maxBytes) => storage.downloadObjectToFile(key, path, maxBytes),
      normalizeImageFile,
      probeDuration: probeCommunityMediaDuration,
      transcodeVoiceFile,
      uploadFile: async ({ key, path, contentType }) => {
        const file = await stat(path);
        await storage.uploadObjectStream({ key, body: createReadStream(path), contentType, sizeBytes: file.size });
        return { sizeBytes: file.size };
      },
      mirrorToReserve: storage.mirrorObjectToReserve,
      deleteCopies: storage.deleteObjectCopies,
      registerCandidate: async (manifestId, result) => {
        await db.insert(communityMediaCandidates).values({
          manifestId,
          leaseToken,
          leaseUpdatedAt: claimed.updatedAt,
          candidateObjectKey: result.candidateObjectKey,
          finalObjectKey: result.finalObjectKey,
          result: { ...result },
          status: "staged",
          errorCode: null,
          updatedAt: new Date()
        });
      },
      cleanupCandidate: requestCommunityMediaCandidateCleanup,
      complete: async (manifestId, result) => {
        await db.transaction(async (transaction) => {
          const database = transaction as unknown as typeof db;
          const publishingAt = new Date();
          const [publishing] = await database.update(communityUploadManifests).set({
            status: "publishing",
            errorCode: null,
            updatedAt: publishingAt
          }).where(and(
            eq(communityUploadManifests.id, manifestId),
            eq(communityUploadManifests.status, "normalizing"),
            eq(communityUploadManifests.updatedAt, claimed.updatedAt),
            isNotNull(communityUploadManifests.attachmentId)
          ))
            .returning({ id: communityUploadManifests.id });
          if (!publishing) throw new Error("manifest_lease_lost");
          const [candidate] = await database.update(communityMediaCandidates).set({
            status: "publishing",
            result: { ...result },
            errorCode: null,
            updatedAt: publishingAt
          }).where(and(
            eq(communityMediaCandidates.manifestId, manifestId),
            eq(communityMediaCandidates.leaseToken, leaseToken),
            eq(communityMediaCandidates.candidateObjectKey, result.candidateObjectKey),
            eq(communityMediaCandidates.status, "staged")
          )).returning({ id: communityMediaCandidates.id });
          if (!candidate) throw new Error("candidate_tracking_lost");
        });
        await publishAndFinalizeCommunityMediaCandidate({
          id: manifestId,
          kind: manifest.kind,
          uploadToken: manifest.uploadToken
        }, result);
      },
      fail: async (manifestId, errorCode) => {
        return db.transaction(async (transaction) => {
          const database = transaction as unknown as typeof db;
          const [failed] = await database.update(communityUploadManifests).set({ status: "failed", errorCode, updatedAt: new Date() })
            .where(and(
              eq(communityUploadManifests.id, manifestId),
              eq(communityUploadManifests.status, "normalizing"),
              eq(communityUploadManifests.updatedAt, claimed.updatedAt),
              isNotNull(communityUploadManifests.attachmentId)
            ))
            .returning({ attachmentId: communityUploadManifests.attachmentId });
          if (!failed?.attachmentId) return false;
          if (failed?.attachmentId) {
            await database.update(clubMessageAttachments).set({ scanStatus: "failed", scanError: errorCode, scannedAt: new Date() })
              .where(eq(clubMessageAttachments.id, failed.attachmentId));
          }
          return true;
        });
      }
    });
    processed += 1;
  }
  return processed;
}

export async function runCommunityMediaCandidateSweepBatch(limit = 20) {
  const [{ db }, { communityMediaCandidates, communityUploadManifests }] = await Promise.all([
    import("../db/client"),
    import("../db/schema")
  ]);
  const retryAt = new Date(Date.now() - communityMediaCleanupPolicy.retryAfterMs);
  const staleAt = new Date(Date.now() - communityMediaCleanupPolicy.staleAfterMs);
  const candidates = await loadCommunityMediaSweepCandidates(limit, (boundedLimit) =>
    db.query.communityMediaCandidates.findMany({
      where: or(
        and(
          inArray(communityMediaCandidates.status, [...communityMediaCleanupPolicy.retryStatuses]),
          lte(communityMediaCandidates.updatedAt, retryAt)
        ),
        and(
          inArray(communityMediaCandidates.status, [...communityMediaCleanupPolicy.staleStatuses]),
          lte(communityMediaCandidates.updatedAt, staleAt)
        )
      ),
      orderBy: [asc(communityMediaCandidates.updatedAt)],
      limit: boundedLimit
    })
  );
  let processed = 0;
  for (const candidate of candidates) {
    const manifest = await db.query.communityUploadManifests.findFirst({
      where: eq(communityUploadManifests.id, candidate.manifestId),
      columns: {
        id: true,
        kind: true,
        uploadToken: true,
        status: true,
        updatedAt: true,
        finalObjectKey: true,
        attachmentId: true
      }
    });
    if (candidate.status === "publishing") {
      const action = getCommunityMediaCandidateRecoveryAction({
        finalObjectKey: candidate.finalObjectKey,
        status: "publishing"
      }, manifest ?? null);
      if (action === "publish" && manifest) {
        try {
          await publishAndFinalizeCommunityMediaCandidate(manifest, readMediaCandidateResult(candidate.result));
        } catch (error) {
          const errorCode = error instanceof Error ? error.message.slice(0, 160) : "candidate_publish_failed";
          await db.update(communityMediaCandidates).set({ errorCode, updatedAt: new Date() })
            .where(and(
              eq(communityMediaCandidates.id, candidate.id),
              eq(communityMediaCandidates.status, "publishing")
            )).catch(() => undefined);
        }
      } else {
        await requestCommunityMediaCandidateCleanup(
          candidate.manifestId,
          candidate.candidateObjectKey,
          action === "discard"
        );
      }
      processed += 1;
      continue;
    }
    const outcome = await cleanupPersistedCommunityMediaCandidate({
      ...candidate,
      status: candidate.status as CleanupCandidate["status"],
      manifestStatus: manifest?.status ?? "missing",
      manifestUpdatedAt: manifest?.updatedAt ?? new Date(0)
    });
    if (outcome !== "skipped") processed += 1;
  }
  return processed;
}

export function startCommunityMediaProcessorJob(intervalMs = 5_000) {
  let active: Promise<void> | null = null;
  const run = () => {
    if (active) return;
    active = (async () => {
      try {
        await runCommunityMediaProcessorBatch();
      } catch (error) {
        (await import("../logger")).logger.warn({ error }, "community media processor batch failed");
      }
      try {
        await runCommunityMediaCandidateSweepBatch();
      } catch (error) {
        (await import("../logger")).logger.warn({ error }, "community media candidate sweep failed");
      }
    })()
      .finally(() => { active = null; });
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return { stop: async () => { clearInterval(timer); await active; } };
}
