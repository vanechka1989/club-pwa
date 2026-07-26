export function localUploadResponseHeaders(contentType: string) {
  return {
    "Cache-Control": "private, no-store",
    "Content-Type": contentType,
    Vary: "Cookie"
  };
}
