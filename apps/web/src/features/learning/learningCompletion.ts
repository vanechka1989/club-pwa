export type LearningCompletionEvidence = {
  alreadyCompleted: boolean;
  activeSeconds: number;
  reachedEnd: boolean;
  primaryMedia: {
    positionSeconds: number;
    durationSeconds: number;
    playedSeconds: number;
  } | null;
};

const staticCompletionSeconds = 10;
const mediaCompletionRatio = 0.8;

export function shouldAutoCompleteLearningContent(evidence: LearningCompletionEvidence) {
  if (evidence.alreadyCompleted) return false;

  if (!evidence.primaryMedia) {
    return evidence.activeSeconds >= staticCompletionSeconds && evidence.reachedEnd;
  }

  const { durationSeconds, positionSeconds, playedSeconds } = evidence.primaryMedia;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return false;

  const requiredPlaybackSeconds = Math.min(10, durationSeconds * 0.2);
  return positionSeconds / durationSeconds >= mediaCompletionRatio
    && playedSeconds >= requiredPlaybackSeconds;
}
