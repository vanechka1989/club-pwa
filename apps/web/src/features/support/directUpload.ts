import type { SupportUploadIntent, SupportUploadIntentResponse, SupportUploadedObject } from "@club/shared";
import { createSupportUploadIntent, getApiRequestHeaders } from "@/api/client";
import { apiUrl } from "@/api/http";

const maxFileBytes = 50 * 1024 * 1024;
const maxTotalBytes = 100 * 1024 * 1024;
const maxFiles = 4;
const extensionTypes: Record<string, SupportUploadIntent["contentType"]> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm"
};
const allowedTypes = new Set(Object.values(extensionTypes));

type SupportFileDescriptor = Pick<File, "name" | "type" | "size">;
export type SupportFilesError = "too_many_files" | "empty_file" | "file_too_large" | "total_too_large" | "unsupported_type";

export function getSupportFileContentType(file: SupportFileDescriptor): SupportUploadIntent["contentType"] | null {
  if (allowedTypes.has(file.type as SupportUploadIntent["contentType"])) {
    return file.type as SupportUploadIntent["contentType"];
  }
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return (!file.type || file.type === "application/octet-stream") ? extensionTypes[extension] ?? null : null;
}

export function getSupportFilesError(files: SupportFileDescriptor[]): SupportFilesError | null {
  if (files.length > maxFiles) return "too_many_files";
  if (files.some((file) => file.size <= 0)) return "empty_file";
  if (files.some((file) => file.size > maxFileBytes)) return "file_too_large";
  if (files.some((file) => !getSupportFileContentType(file))) return "unsupported_type";
  if (files.reduce((total, file) => total + file.size, 0) > maxTotalBytes) return "total_too_large";
  return null;
}

export async function putSupportObject(
  url: string,
  file: File,
  contentType: string,
  fetchImpl: typeof fetch = fetch
) {
  const response = await fetchImpl(url, {
    method: "PUT",
    headers: getApiRequestHeaders({ "Content-Type": contentType }),
    credentials: "include",
    body: file
  });
  if (!response.ok) throw new Error("support_s3_upload_failed");
}

export function resolveSupportUploadUrl(uploadPath: string, baseUrl = apiUrl) {
  if (/^https?:\/\//i.test(uploadPath)) return uploadPath;
  return `${baseUrl.replace(/\/$/, "")}/${uploadPath.replace(/^\//, "")}`;
}

type UploadDependencies = {
  createIntent: (input: SupportUploadIntent) => Promise<SupportUploadIntentResponse>;
  putObject: (url: string, file: File, contentType: string) => Promise<void>;
};

export async function uploadSupportAttachments(
  files: File[],
  dependencies: UploadDependencies = { createIntent: createSupportUploadIntent, putObject: putSupportObject }
): Promise<SupportUploadedObject[]> {
  const policyError = getSupportFilesError(files);
  if (policyError) throw new Error(policyError);

  const uploaded: SupportUploadedObject[] = [];
  for (const file of files) {
    const contentType = getSupportFileContentType(file);
    if (!contentType) throw new Error("unsupported_type");
    const intent = await dependencies.createIntent({ fileName: file.name, contentType, sizeBytes: file.size });
    await dependencies.putObject(resolveSupportUploadUrl(intent.uploadUrl), file, intent.contentType);
    uploaded.push({
      objectKey: intent.objectKey,
      uploadToken: intent.uploadToken,
      fileName: file.name,
      contentType: intent.contentType,
      sizeBytes: file.size
    });
  }
  return uploaded;
}
