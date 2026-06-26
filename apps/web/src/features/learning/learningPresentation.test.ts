import { describe, expect, it } from "vitest";
import { formatLearningPlaybackLabel, formatPlaybackTime } from "./learningPresentation";

describe("learning presentation", () => {
  it("formats playback time for resume labels", () => {
    expect(formatPlaybackTime(252)).toBe("04:12");
    expect(formatPlaybackTime(3723)).toBe("1:02:03");
  });

  it("builds resume labels for media content", () => {
    expect(formatLearningPlaybackLabel("video", 252)).toBe("Продолжить с 04:12");
    expect(formatLearningPlaybackLabel("audio", 7)).toBe("Продолжить с 00:07");
    expect(formatLearningPlaybackLabel("text", 252)).toBe("Открыть контент");
  });
});
