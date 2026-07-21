import type { LearningEngagementSnapshot } from "@club/shared";

type TrackerOptions = {
  sessionId?: string;
  now?: () => number;
  isVisible?: () => boolean;
  isFocused?: () => boolean;
  send: (snapshot: LearningEngagementSnapshot) => Promise<unknown>;
  startTimer?: (callback: () => void, intervalMs: number) => number;
  stopTimer?: (timerId: number) => void;
  heartbeatMs?: number;
};

export function createLearningEngagementTracker(options: TrackerOptions) {
  const now = options.now ?? (() => Date.now());
  const isVisible = options.isVisible ?? (() => document.visibilityState === "visible");
  const isFocused = options.isFocused ?? (() => document.hasFocus());
  const startTimer = options.startTimer ?? ((callback, intervalMs) => window.setInterval(callback, intervalMs));
  const stopTimer = options.stopTimer ?? ((timerId) => window.clearInterval(timerId));
  const sessionId = options.sessionId ?? crypto.randomUUID();
  let lastSampleAt = now();
  let active = isVisible() && isFocused();
  let videoPlaying = false;
  let activeMilliseconds = 0;
  let videoMilliseconds = 0;
  let materialId: string | null = null;
  let playbackPositionSeconds = 0;
  let disposed = false;

  function capture() {
    const sampledAt = now();
    const elapsed = Math.max(0, sampledAt - lastSampleAt);
    if (active) {
      activeMilliseconds += elapsed;
      if (videoPlaying) videoMilliseconds += elapsed;
    }
    lastSampleAt = sampledAt;
  }

  function snapshot(closed: boolean): LearningEngagementSnapshot {
    const activeSeconds = Math.min(86_400, Math.floor(activeMilliseconds / 1000));
    return {
      sessionId,
      activeSeconds,
      videoSeconds: Math.min(activeSeconds, Math.floor(videoMilliseconds / 1000)),
      playbackPositionSeconds: Math.min(86_400, Math.max(0, Math.floor(playbackPositionSeconds))),
      materialId,
      closed
    };
  }

  async function flush(closed = false) {
    if (disposed && !closed) return;
    capture();
    await options.send(snapshot(closed)).catch(() => undefined);
  }

  const timerId = startTimer(() => { void flush(); }, options.heartbeatMs ?? 15_000);

  return {
    sessionId,
    syncActivityState() {
      capture();
      active = isVisible() && isFocused();
    },
    setVideoPlaying(value: boolean) {
      capture();
      videoPlaying = value;
    },
    setMaterial(value: string | null) {
      capture();
      materialId = value;
    },
    setPlaybackPosition(value: number) {
      playbackPositionSeconds = value;
    },
    flush,
    async dispose() {
      if (disposed) return;
      capture();
      disposed = true;
      stopTimer(timerId);
      await options.send(snapshot(true)).catch(() => undefined);
    }
  };
}

export type LearningEngagementTracker = ReturnType<typeof createLearningEngagementTracker>;
