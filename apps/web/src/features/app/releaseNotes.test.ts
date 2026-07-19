import { describe, expect, it } from "vitest";
import { appVersion } from "./version";
import { getLocalizedReleaseNotes, getReleaseNoteByVersion, releaseNotes } from "./releaseNotes";

describe("release notes", () => {
  it("publishes the compact role preview switcher as version 5.19", () => {
    expect(appVersion).toBe("5.19");
    expect(releaseNotes[0]?.title).toBe("Компактный переключатель ролей");
    expect(releaseNotes[0]?.items.join(" ")).toContain("Вид как");

    const previousRelease = releaseNotes.find((note) => note.version === "5.18");
    expect(previousRelease?.title).toBe("Единые кнопки профиля");
    expect(previousRelease?.items.join(" ")).toContain("карандаш");

    const navigationFix = releaseNotes.find((note) => note.version === "5.13");
    expect(navigationFix?.title).toBe("Убрана полоса под нижним меню");
    expect(navigationFix?.items.join(" ")).toContain("iPhone и Android");
  });

  it("keeps the current app version at the top of the changelog", () => {
    expect(releaseNotes[0]?.version).toBe(appVersion);
    expect(releaseNotes[0]?.items.length).toBeGreaterThan(0);
  });

  it("orders versions from newest to oldest", () => {
    const numericVersions = releaseNotes.map((note) => Number(note.version));
    const sortedVersions = [...numericVersions].sort((left, right) => right - left);

    expect(numericVersions).toEqual(sortedVersions);
  });

  it("does not skip patch versions in the visible changelog", () => {
    const numericVersions = releaseNotes.map((note) => Math.round(Number(note.version) * 100));

    for (let index = 1; index < numericVersions.length; index += 1) {
      const previous = numericVersions[index - 1];
      const current = numericVersions[index];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      expect(previous! - current!).toBe(1);
    }
  });

  it("finds release details by version", () => {
    expect(getReleaseNoteByVersion(appVersion)?.version).toBe(appVersion);
    expect(getReleaseNoteByVersion("0.00")).toBeNull();
  });

  it("does not expose Russian system copy in the English changelog", () => {
    const englishNotes = getLocalizedReleaseNotes("en");
    expect(englishNotes[0]?.title).toBe("Compact role preview switcher");
    expect(englishNotes.flatMap((note) => [note.title, ...note.items]).join(" ")).not.toMatch(/[А-Яа-яЁё]/);
  });
});
