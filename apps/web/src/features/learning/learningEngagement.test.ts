import { describe, expect, it, vi } from "vitest";
import { createLearningEngagementTracker } from "./learningEngagement";

describe("learning engagement tracker", () => {
  it("counts only focused visible time and video playback", async () => {
    let now = 0;
    let visible = true;
    let focused = true;
    const snapshots: Array<Record<string, unknown>> = [];
    const tracker = createLearningEngagementTracker({
      sessionId: "00000000-0000-4000-8000-000000000001",
      now: () => now,
      isVisible: () => visible,
      isFocused: () => focused,
      send: async (snapshot) => { snapshots.push(snapshot); },
      startTimer: () => 1,
      stopTimer: () => {}
    });

    now = 5_000;
    tracker.setVideoPlaying(true);
    now = 10_000;
    visible = false;
    tracker.syncActivityState();
    now = 30_000;
    tracker.setVideoPlaying(false);
    focused = false;
    visible = true;
    tracker.syncActivityState();
    now = 40_000;
    await tracker.flush();

    expect(snapshots.at(-1)).toMatchObject({ activeSeconds: 10, videoSeconds: 5 });
  });

  it("sends cumulative retry-safe values and closes once on dispose", async () => {
    let now = 0;
    const send = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const tracker = createLearningEngagementTracker({
      sessionId: "00000000-0000-4000-8000-000000000001",
      now: () => now,
      isVisible: () => true,
      isFocused: () => true,
      send,
      startTimer: () => 1,
      stopTimer: () => {}
    });

    now = 15_000;
    await tracker.flush();
    now = 20_000;
    await tracker.dispose();

    expect(send.mock.calls[0]?.[0]).toMatchObject({ activeSeconds: 15, closed: false });
    expect(send.mock.calls[1]?.[0]).toMatchObject({ activeSeconds: 20, closed: true });
  });

  it("includes current material and playback position", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const tracker = createLearningEngagementTracker({
      sessionId: "00000000-0000-4000-8000-000000000001",
      now: () => 0,
      isVisible: () => true,
      isFocused: () => true,
      send,
      startTimer: () => 1,
      stopTimer: () => {}
    });
    tracker.setMaterial("00000000-0000-4000-8000-000000000002");
    tracker.setPlaybackPosition(73);
    await tracker.flush();
    expect(send.mock.calls[0]?.[0]).toMatchObject({ materialId: "00000000-0000-4000-8000-000000000002", playbackPositionSeconds: 73 });
  });

  it("provides a current snapshot without sending it", () => {
    let now = 0;
    const send = vi.fn().mockResolvedValue(undefined);
    const tracker = createLearningEngagementTracker({
      now: () => now,
      isVisible: () => true,
      isFocused: () => true,
      send,
      startTimer: () => 1,
      stopTimer: () => {}
    });

    now = 10_000;
    expect(tracker.currentSnapshot()).toMatchObject({ activeSeconds: 10, closed: false });
    expect(send).not.toHaveBeenCalled();
  });
});
