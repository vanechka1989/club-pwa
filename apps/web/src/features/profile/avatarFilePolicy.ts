export const avatarMaxSizeBytes = 10 * 1024 * 1024;

const avatarAllowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const avatarAllowedExtension = /\.(jpe?g|png|webp)$/i;

export type AvatarFileError = "empty_file" | "file_too_large" | "unsupported_type";

export function getAvatarFileError(file: Pick<File, "size" | "type" | "name">): AvatarFileError | null {
  if (file.size <= 0) return "empty_file";
  if (file.size > avatarMaxSizeBytes) return "file_too_large";
  if (!avatarAllowedTypes.has(file.type) && !avatarAllowedExtension.test(file.name)) return "unsupported_type";
  return null;
}
