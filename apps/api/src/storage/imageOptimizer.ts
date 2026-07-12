import sharp from "sharp";

const optimizedImageContentType = "image/webp";

export function shouldOptimizeImageContentType(contentType: string) {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  return normalized === "image/jpeg" || normalized === "image/png";
}

export function getOptimizedImageFileName(fileName: string) {
  const trimmed = fileName.trim() || "image";
  const withoutExtension = trimmed.replace(/\.[^.\\/]+$/, "") || "image";
  return `${withoutExtension}.webp`;
}

export async function optimizeImageForUpload({
  bytes,
  contentType,
  fileName,
  maxDimension = 1600,
  forceWebp = false
}: {
  bytes: Uint8Array;
  contentType: string;
  fileName: string;
  maxDimension?: number;
  forceWebp?: boolean;
}) {
  if (!forceWebp && !shouldOptimizeImageContentType(contentType)) {
    return {
      body: bytes,
      contentType,
      fileName,
      sizeBytes: bytes.byteLength
    };
  }

  const body = await sharp(bytes)
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: 82 })
    .toBuffer();

  return {
    body,
    contentType: optimizedImageContentType,
    fileName: getOptimizedImageFileName(fileName),
    sizeBytes: body.byteLength
  };
}
