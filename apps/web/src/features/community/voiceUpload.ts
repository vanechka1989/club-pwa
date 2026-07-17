export const communityVoiceRecorderMimeTypes = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/ogg"
] as const;

export function getPreferredCommunityVoiceMimeType(isSupported: (mimeType: string) => boolean) {
  return communityVoiceRecorderMimeTypes.find(isSupported);
}

export function getCommunityVoiceUploadFileName(contentType: string) {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim();
  if (normalized === "audio/mp4" || normalized === "video/mp4") return "voice.m4a";
  if (normalized === "audio/ogg") return "voice.ogg";
  if (normalized === "audio/mpeg") return "voice.mp3";
  if (normalized === "audio/aac") return "voice.aac";
  if (normalized === "audio/wav" || normalized === "audio/x-wav") return "voice.wav";
  return "voice.webm";
}
