import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { optimizeImageForUpload } from "../storage/imageOptimizer";

const execFileAsync = promisify(execFile);

export const communityVoiceMaxBytes = 30 * 1024 * 1024;
export const communityImageMaxBytes = 15 * 1024 * 1024;
export const communityImageMaxCount = 10;

function extension(fileName: string) {
  return fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

export function getCommunityVoiceContentType(contentType: string, fileName: string) {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  const ext = extension(fileName);
  const allowedAudioTypes = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/aac", "audio/wav", "audio/x-wav"]);
  if (allowedAudioTypes.has(normalized)) return normalized === "audio/x-wav" ? "audio/wav" : normalized;
  if (normalized === "video/mp4" && (ext === "m4a" || ext === "mp4")) return "audio/mp4";
  return ({ webm: "audio/webm", m4a: "audio/mp4", mp4: "audio/mp4", ogg: "audio/ogg", mp3: "audio/mpeg", aac: "audio/aac", wav: "audio/wav" } as Record<string, string>)[ext] ?? null;
}

function safeName(fileName: string) {
  return fileName.trim().toLowerCase().replace(/[^a-z0-9а-яё._-]+/giu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "media";
}

export function getCommunityVoiceStoragePlan(contentType: string, fileName: string) {
  const normalized = getCommunityVoiceContentType(contentType, fileName);
  if (!normalized) return null;
  const sourceName = safeName(fileName || "voice");
  const stem = sourceName.replace(/\.[a-z0-9]+$/i, "") || "voice";
  return {
    contentType: "audio/mp4" as const,
    fileName: `${stem}.m4a`,
    transcode: normalized !== "audio/mp4"
  };
}

export async function prepareCommunityVoice(file: File) {
  const plan = getCommunityVoiceStoragePlan(file.type, file.name);
  if (!plan) throw new Error("Unsupported voice format");
  const source = new Uint8Array(await file.arrayBuffer());
  if (!plan.transcode) return { ...plan, body: source };

  const directory = await mkdtemp(join(tmpdir(), "club-voice-"));
  const sourceExtension = extname(file.name).replace(/[^.a-z0-9]/gi, "") || ".audio";
  const inputPath = join(directory, `input${sourceExtension}`);
  const outputPath = join(directory, basename(plan.fileName));
  try {
    await writeFile(inputPath, source);
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-ac",
      "1",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      outputPath
    ]);
    return { ...plan, body: new Uint8Array(await readFile(outputPath)) };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function buildCommunityMediaObjectKey(kind: "voice" | "image", messageId: string, assetId: string, fileName: string) {
  return `${kind === "voice" ? "community/voice" : "community/images"}/${messageId}/${assetId}-${safeName(fileName)}`;
}

export function validateCommunityImageFiles(files: File[]) {
  if (files.length < 1 || files.length > communityImageMaxCount) return "Можно прикрепить от 1 до 10 изображений.";
  if (files.some((file) => file.size > communityImageMaxBytes)) return "Размер каждого изображения не должен превышать 15 МБ.";
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
  if (files.some((file) => !allowedTypes.has(file.type.toLowerCase()))) return "Неподдерживаемый формат изображения.";
  return null;
}

export async function prepareCommunityImage(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const optimized = await optimizeImageForUpload({ bytes, contentType: file.type, fileName: file.name, maxDimension: 1600, forceWebp: true });
  const metadata = await sharp(optimized.body).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Не удалось определить размер изображения.");
  return { ...optimized, width: metadata.width, height: metadata.height };
}
