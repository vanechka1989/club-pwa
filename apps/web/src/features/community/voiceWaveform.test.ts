import { describe, expect, it } from "vitest";
import * as waveform from "./voiceWaveform";

describe("voice waveform model", () => {
  it("normalizes microphone levels into a readable bounded range", () => {
    const normalizeVoiceLevel = (waveform as { normalizeVoiceLevel?: (value: number) => number }).normalizeVoiceLevel;
    expect(typeof normalizeVoiceLevel).toBe("function");
    expect(normalizeVoiceLevel?.(-1)).toBe(0.12);
    expect(normalizeVoiceLevel?.(0.5)).toBe(0.5);
    expect(normalizeVoiceLevel?.(2)).toBe(1);
    expect(normalizeVoiceLevel?.(Number.NaN)).toBe(0.12);
  });

  it("keeps a rolling level buffer", () => {
    const appendVoiceLevel = (waveform as { appendVoiceLevel?: (levels: number[], value: number, limit?: number) => number[] }).appendVoiceLevel;
    expect(typeof appendVoiceLevel).toBe("function");
    expect(appendVoiceLevel?.([0.2, 0.3, 0.4], 0.8, 3)).toEqual([0.3, 0.4, 0.8]);
  });

  it("clamps playback progress between zero and one", () => {
    const voiceProgress = (waveform as { voiceProgress?: (currentTime: number, duration: number) => number }).voiceProgress;
    expect(typeof voiceProgress).toBe("function");
    expect(voiceProgress?.(5, 10)).toBe(0.5);
    expect(voiceProgress?.(-1, 10)).toBe(0);
    expect(voiceProgress?.(12, 10)).toBe(1);
    expect(voiceProgress?.(2, 0)).toBe(0);
  });
});
