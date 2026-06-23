import { describe, expect, it } from "vitest";
import { formatMuteDuration, formatMuteSystemMessage, formatUnmuteSystemMessage } from "./muteNotice";

describe("muteNotice", () => {
  it("formats temporary mute duration", () => {
    const now = new Date("2026-06-23T12:00:00.000Z");
    const expiresAt = new Date("2026-06-23T18:00:00.000Z");

    expect(formatMuteDuration("temporary", expiresAt, now)).toBe("6 часов");
  });

  it("formats permanent mute duration", () => {
    expect(formatMuteDuration("permanent", null, new Date("2026-06-23T12:00:00.000Z"))).toBe("бессрочно");
  });

  it("builds system message text", () => {
    expect(
      formatMuteSystemMessage({
        moderatorName: "Ivan",
        targetName: "Екатерина",
        duration: "30 минут"
      })
    ).toBe("Ivan наложил мут на Екатерина: 30 минут.");
  });

  it("builds unmute system message text", () => {
    expect(
      formatUnmuteSystemMessage({
        moderatorName: "Ivan",
        targetName: "Екатерина"
      })
    ).toBe("Ivan снял мут с Екатерина.");
  });
});
