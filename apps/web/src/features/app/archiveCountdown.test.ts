import { describe, expect, it } from "vitest";
import { formatArchiveDeletionLabel } from "./archiveCountdown";

const now = new Date("2026-06-30T05:00:00.000Z");

describe("archive deletion countdown", () => {
  it("shows days left and deletion date", () => {
    expect(formatArchiveDeletionLabel("2026-07-07T05:00:00.000Z", now)).toBe("Будет удалено через 7 дн. · до 07.07.2026");
  });

  it("shows today when less than one day remains", () => {
    expect(formatArchiveDeletionLabel("2026-06-30T12:00:00.000Z", now)).toBe("Удалится сегодня · до 30.06.2026");
  });

  it("handles missing archive date", () => {
    expect(formatArchiveDeletionLabel(null, now)).toBe("Дата удаления не указана");
  });
});
