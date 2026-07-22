import { describe, expect, it } from "vitest";
import { shouldAutoCompleteLearningContent } from "./learningCompletion";

describe("automatic learning completion", () => {
  it("completes static content only after active reading and reaching the end", () => {
    expect(shouldAutoCompleteLearningContent({ alreadyCompleted: false, activeSeconds: 9, reachedEnd: true, primaryMedia: null })).toBe(false);
    expect(shouldAutoCompleteLearningContent({ alreadyCompleted: false, activeSeconds: 10, reachedEnd: false, primaryMedia: null })).toBe(false);
    expect(shouldAutoCompleteLearningContent({ alreadyCompleted: false, activeSeconds: 10, reachedEnd: true, primaryMedia: null })).toBe(true);
  });

  it("requires both 80 percent position and genuine playback for media", () => {
    const base = { alreadyCompleted: false, activeSeconds: 10, reachedEnd: false };
    expect(shouldAutoCompleteLearningContent({ ...base, primaryMedia: { positionSeconds: 80, durationSeconds: 100, playedSeconds: 9 } })).toBe(false);
    expect(shouldAutoCompleteLearningContent({ ...base, primaryMedia: { positionSeconds: 79, durationSeconds: 100, playedSeconds: 10 } })).toBe(false);
    expect(shouldAutoCompleteLearningContent({ ...base, primaryMedia: { positionSeconds: 80, durationSeconds: 100, playedSeconds: 10 } })).toBe(true);
  });

  it("does not complete an item twice or with invalid media metadata", () => {
    expect(shouldAutoCompleteLearningContent({ alreadyCompleted: true, activeSeconds: 30, reachedEnd: true, primaryMedia: null })).toBe(false);
    expect(shouldAutoCompleteLearningContent({
      alreadyCompleted: false,
      activeSeconds: 30,
      reachedEnd: true,
      primaryMedia: { positionSeconds: 30, durationSeconds: 0, playedSeconds: 30 }
    })).toBe(false);
  });
});
