import { describe, expect, it } from "vitest";
import { readShowcaseState, regenerateShowcaseSeed, writeShowcaseState } from "./showcaseMode";

describe("analytics showcase mode state", () => {
  it("persists the presentation choice and seed only in the supplied device storage", () => {
    const storage = new Map<string, string>();
    const deviceStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    };

    expect(readShowcaseState(deviceStorage)).toEqual({ enabled: false, seed: expect.any(Number) });
    writeShowcaseState(deviceStorage, { enabled: true, seed: 12345 });
    expect(readShowcaseState(deviceStorage)).toEqual({ enabled: true, seed: 12345 });
  });

  it("produces a different valid seed for regeneration", () => {
    expect(regenerateShowcaseSeed(12345, () => 0.5)).not.toBe(12345);
    expect(regenerateShowcaseSeed(12345, () => 0.5)).toBeGreaterThan(0);
  });
});
