export type NamedBlobUpload = {
  blob: Blob;
  name: string;
};

function normalizeVoiceMimeType(chunks: Blob[], recorderMimeType?: string) {
  const mimeType = recorderMimeType || chunks.find((chunk) => chunk.type)?.type || "audio/webm";

  if (mimeType.toLowerCase().startsWith("video/")) {
    return mimeType.replace(/^video\//i, "audio/");
  }

  return mimeType;
}

function extensionForMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase();

  if (normalized.includes("mp4") || normalized.includes("aac")) {
    return "m4a";
  }

  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "mp3";
  }

  if (normalized.includes("ogg") || normalized.includes("opus")) {
    return normalized.includes("webm") ? "webm" : "ogg";
  }

  if (normalized.includes("wav")) {
    return "wav";
  }

  return "webm";
}

export function createVoiceUpload(chunks: Blob[], recorderMimeType?: string): NamedBlobUpload {
  const mimeType = normalizeVoiceMimeType(chunks, recorderMimeType);

  return {
    blob: new Blob(chunks, { type: mimeType }),
    name: `voice-message.${extensionForMimeType(mimeType)}`
  };
}
