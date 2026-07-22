import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const section = readFileSync(resolve(__dirname, "LearningSection.vue"), "utf8");
const client = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf8");

describe("learning engagement integration", () => {
  it("starts member tracking on persisted lesson view and closes it on exit", () => {
    expect(section).toContain("startLearningEngagement(lesson)");
    expect(section).toContain("stopLearningEngagement()");
    expect(section).toContain("learningEngagementTracker?.syncActivityState()");
    expect(section).toContain("if (wantsEditor) {");
    expect(section).toContain("startLearningEngagement(lesson);");
  });

  it("tracks main and material playback without affecting playback persistence", () => {
    expect(section).toContain("learningEngagementTracker?.setVideoPlaying");
    expect(section).toContain("learningEngagementTracker?.setMaterial(material.id)");
    expect(section).toContain("saveLearningPlayback");
  });

  it("posts cumulative snapshots to the member endpoint", () => {
    expect(client).toContain("export function saveLearningEngagement");
    expect(client).toContain("/engagement`");
  });

  it("automatically completes eligible lessons with offline retry", () => {
    expect(section).toContain("shouldAutoCompleteLearningContent");
    expect(section).toContain("queueLearningCompletion");
    expect(section).toContain("flushLearningCompletionOutbox");
    expect(section).toContain("learningEngagementTracker?.currentSnapshot()");
    expect(section).toContain('@scroll.passive="handleLessonViewerScroll"');
    expect(section).toContain('@load="updateLessonReachedEnd()"');
    expect(client).toContain("completeLearningContent(id: string, options:");
    expect(client).toContain("keepalive: true");
  });
});
