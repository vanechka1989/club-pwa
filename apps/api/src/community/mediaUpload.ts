import sharp from "sharp";
import { optimizeImageForUpload } from "../storage/imageOptimizer";

export const communityVoiceMaxBytes = 30 * 1024 * 1024;
export const communityImageMaxBytes = 15 * 1024 * 1024;
export const communityImageMaxCount = 10;

function extension(fileName: string) {
  return fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

export function getCommunityVoiceContentType(contentType: string, fileName: string) {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  const ext = extension(fileName);
  if (normalized.startsWith("audio/")) return normalized;
  if (normalized === "video/mp4" && (ext === "m4a" || ext === "mp4")) return "audio/mp4";
  return ({ webm: "audio/webm", m4a: "audio/mp4", mp4: "audio/mp4", ogg: "audio/ogg", mp3: "audio/mpeg", aac: "audio/aac", wav: "audio/wav" } as Record<string, string>)[ext] ?? null;
}

function safeName(fileName: string) {
  return fileName.trim().toLowerCase().replace(/[^a-z0-9а-яё._-]+/giu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "media";
}

export function buildCommunityMediaObjectKey(kind: "voice" | "image", messageId: string, assetId: string, fileName: string) {
  return `${kind === "voice" ? "community/voice" : "community/images"}/${messageId}/${assetId}-${safeName(fileName)}`;
}

export function validateCommunityImageFiles(files: File[]) {
  if (files.length < 1 || files.length > communityImageMaxCount) return "Можно прикрепить от 1 до 10 изображений.";
  if (files.some((file) => file.size > communityImageMaxBytes)) return "Размер каждого изображения не должен превышать 15 МБ.";
  if (files.some((file) => !file.type.toLowerCase().startsWith("image/"))) return "Поддерживаются только изображения.";
  return null;
}

export async function prepareCommunityImage(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const optimized = await optimizeImageForUpload({ bytes, contentType: file.type, fileName: file.name, maxDimension: 1600, forceWebp: true });
  const metadata = await sharp(optimized.body).metadata();
  if (!metadata.width || !metadata.height) throw new Error("Не удалось определить размер изображения.");
  return { ...optimized, width: metadata.width, height: metadata.height };
}
