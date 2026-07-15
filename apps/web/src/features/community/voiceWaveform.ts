export const voiceLevelFloor = 0.12;

export function normalizeVoiceLevel(value: number) {
  if (!Number.isFinite(value)) return voiceLevelFloor;
  return Math.min(1, Math.max(voiceLevelFloor, value));
}

export function appendVoiceLevel(levels: number[], value: number, limit = 36) {
  const safeLimit = Math.max(1, Math.floor(limit));
  return [...levels, normalizeVoiceLevel(value)].slice(-safeLimit);
}

export function voiceProgress(currentTime: number, duration: number) {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(1, Math.max(0, currentTime / duration));
}

export function formatVoiceTime(value: number) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
