import type { ContentKind } from "@club/shared";
import type { NamedBlobUpload } from "./voiceUpload";

type LearningImageConversion = {
  maxDimension: number;
  quality: number;
};

export function getLearningImageConversion({
  purpose,
  kind,
  contentType
}: {
  purpose: "media" | "thumbnail";
  kind?: ContentKind | undefined;
  contentType: string;
}): LearningImageConversion | null {
  const normalizedType = contentType.toLowerCase();
  if (normalizedType !== "image/jpeg" && normalizedType !== "image/png") {
    return null;
  }

  if (purpose === "thumbnail") {
    return { maxDimension: 1200, quality: 0.84 };
  }

  return kind === "photo" ? { maxDimension: 1920, quality: 0.84 } : null;
}

export function toWebpFileName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  return `${withoutExtension || "image"}.webp`;
}

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Не удалось подготовить изображение для WebP."));
    };
    image.src = objectUrl;
  });
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== "image/webp") {
          reject(new Error("Браузер не поддерживает конвертацию изображения в WebP."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality
    );
  });
}

export async function prepareLearningUpload(
  file: File | NamedBlobUpload,
  options: { purpose: "media" | "thumbnail"; kind?: ContentKind | undefined }
): Promise<File | NamedBlobUpload> {
  const blob = file instanceof File ? file : file.blob;
  const name = file instanceof File ? file.name : file.name;
  const conversion = getLearningImageConversion({ purpose: options.purpose, kind: options.kind, contentType: blob.type });
  if (!conversion) {
    return file;
  }

  const image = await loadImage(blob);
  const scale = Math.min(1, conversion.maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Не удалось подготовить изображение для загрузки.");
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const webp = await canvasToWebp(canvas, conversion.quality);
  const webpName = toWebpFileName(name);

  return new File([webp], webpName, { type: "image/webp", lastModified: file instanceof File ? file.lastModified : Date.now() });
}
