import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { and, asc, eq, inArray, lte, or } from "drizzle-orm";
import sharp from "sharp";
import { buildCommunityFinalObjectKey } from "./directUpload";

const execFileAsync = promisify(execFile);
export const communityVoiceDurationToleranceSeconds = 0.5;

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
  complete: (manifestId: string, result: {
    finalObjectKey: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
  }) => Promise<void>;
  fail: (manifestId: string, errorCode: string) => Promise<void>;
};

function safeStem(fileName: string) {
  return basename(fileName).replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 100) || "media";
}

export async function processCommunityMediaManifest(manifest: MediaManifest, dependencies: MediaProcessorDependencies) {
  let finalObjectKey: string | null = null;
  let completeAttempted = false;
  try {
    return await dependencies.withWorkspace(async ({ inputPath, outputPath }) => {
      await dependencies.downloadToFile(manifest.quarantineObjectKey, inputPath, manifest.sizeBytes);
      if (manifest.kind === "voice") {
        const inputDuration = await dependencies.probeDuration(inputPath);
        if (!Number.isFinite(inputDuration) || inputDuration <= 0 || inputDuration > 300 + communityVoiceDurationToleranceSeconds) {
          throw new Error("voice_duration_exceeded");
        }
        await dependencies.transcodeVoiceFile(inputPath, outputPath);
        const outputDuration = await dependencies.probeDuration(outputPath);
        if (!Number.isFinite(outputDuration) || outputDuration <= 0 || outputDuration > 300 + communityVoiceDurationToleranceSeconds) {
          throw new Error("voice_duration_exceeded");
        }
        const fileName = `${safeStem(manifest.fileName)}.m4a`;
        finalObjectKey = buildCommunityFinalObjectKey({
          userId: manifest.userId,
          uploadToken: manifest.uploadToken,
          fileName
        });
        const upload = await dependencies.uploadFile({ key: finalObjectKey, path: outputPath, contentType: "audio/mp4" });
        await dependencies.mirrorToReserve(finalObjectKey, "audio/mp4");
        completeAttempted = true;
        await dependencies.complete(manifest.id, {
          finalObjectKey,
          fileName,
          contentType: "audio/mp4",
          sizeBytes: upload?.sizeBytes ?? manifest.sizeBytes,
          durationSeconds: Math.min(300, Math.max(1, Math.ceil(outputDuration))),
          width: null,
          height: null
        });
        await dependencies.deleteCopies(manifest.quarantineObjectKey).catch(() => undefined);
        return "ready" as const;
      }

      const normalized = await dependencies.normalizeImageFile(inputPath, outputPath, manifest.fileName);
      finalObjectKey = buildCommunityFinalObjectKey({
        userId: manifest.userId,
        uploadToken: manifest.uploadToken,
        fileName: normalized.fileName
      });
      const upload = await dependencies.uploadFile({ key: finalObjectKey, path: outputPath, contentType: normalized.contentType });
      await dependencies.mirrorToReserve(finalObjectKey, normalized.contentType);
      completeAttempted = true;
      await dependencies.complete(manifest.id, {
        finalObjectKey,
        fileName: normalized.fileName,
        contentType: normalized.contentType,
        sizeBytes: upload?.sizeBytes ?? normalized.sizeBytes,
        durationSeconds: null,
        width: normalized.width,
        height: normalized.height
      });
      await dependencies.deleteCopies(manifest.quarantineObjectKey).catch(() => undefined);
      return "ready" as const;
    });
  } catch (error) {
    if (completeAttempted) throw error;
    await dependencies.deleteCopies(manifest.quarantineObjectKey).catch(() => undefined);
    if (finalObjectKey) await dependencies.deleteCopies(finalObjectKey).catch(() => undefined);
    const errorCode = error instanceof Error && error.message === "voice_duration_exceeded"
      ? "voice_duration_exceeded"
      : "media_processing_failed";
    await dependencies.fail(manifest.id, errorCode);
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

export async function runCommunityMediaProcessorBatch(limit = 4) {
  const [{ db }, { communityUploadManifests }, storage] = await Promise.all([
    import("../db/client"),
    import("../db/schema"),
    import("../storage/s3")
  ]);
  const manifests = await db.query.communityUploadManifests.findMany({
    where: and(
      inArray(communityUploadManifests.kind, ["image", "voice"]),
      inArray(communityUploadManifests.status, ["processing", "normalizing"])
    ),
    orderBy: [asc(communityUploadManifests.createdAt)],
    limit: Math.min(Math.max(1, limit), 4)
  });
  let processed = 0;
  for (const manifest of manifests) {
    if (!manifest.quarantineObjectKey || (manifest.kind !== "image" && manifest.kind !== "voice")) continue;
    const staleAt = new Date(Date.now() - 2 * 60 * 1000);
    const [claimed] = await db.update(communityUploadManifests)
      .set({ status: "normalizing", updatedAt: new Date() })
      .where(and(
        eq(communityUploadManifests.id, manifest.id),
        or(
          eq(communityUploadManifests.status, "processing"),
          and(eq(communityUploadManifests.status, "normalizing"), lte(communityUploadManifests.updatedAt, staleAt))
        )
      ))
      .returning({ id: communityUploadManifests.id });
    if (!claimed) continue;
    await processCommunityMediaManifest({
      ...manifest,
      kind: manifest.kind,
      quarantineObjectKey: manifest.quarantineObjectKey
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
      complete: async (manifestId, result) => {
        const [completed] = await db.update(communityUploadManifests).set({
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
          updatedAt: new Date()
        }).where(and(eq(communityUploadManifests.id, manifestId), eq(communityUploadManifests.status, "normalizing")))
          .returning({ id: communityUploadManifests.id });
        if (!completed) throw new Error("manifest_finish_conflict");
      },
      fail: async (manifestId, errorCode) => {
        await db.update(communityUploadManifests).set({ status: "failed", errorCode, updatedAt: new Date() })
          .where(eq(communityUploadManifests.id, manifestId));
      }
    });
    processed += 1;
  }
  return processed;
}

export function startCommunityMediaProcessorJob(intervalMs = 5_000) {
  let active: Promise<void> | null = null;
  const run = () => {
    if (active) return;
    active = runCommunityMediaProcessorBatch()
      .then(() => undefined)
      .catch(async (error) => (await import("../logger")).logger.warn({ error }, "community media processor batch failed"))
      .finally(() => { active = null; });
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  return { stop: async () => { clearInterval(timer); await active; } };
}
