export const maxMultipartPartSizeBytes = 8 * 1024 * 1024;

export function isValidMultipartPartSize(sizeBytes: number) {
  return Number.isInteger(sizeBytes) && sizeBytes > 0 && sizeBytes <= maxMultipartPartSizeBytes;
}
