import { describe, expect, it } from "vitest";
import { appVersion } from "./version";
import { getLocalizedReleaseNotes, getReleaseNoteByVersion, releaseNotes } from "./releaseNotes";

describe("release notes", () => {
  it("publishes the email, audit, and profile polish as version 5.16", () => {
    expect(appVersion).toBe("5.16");
    expect(releaseNotes[0]?.title).toBe("Чище письмо, аудит и профиль");
    expect(releaseNotes[0]?.items.join(" ")).toContain("письма");
    expect(releaseNotes[0]?.items.join(" ")).toContain("аватар");
    expect(releaseNotes[0]?.items.join(" ")).toContain("карандаш");
    expect(releaseNotes[0]?.items.join(" ")).toContain("источник");
    expect(releaseNotes[0]?.items.join(" ")).toContain("темы чата");

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
    expect(englishNotes[0]?.title).toBe("Cleaner email, audit log, and profile");
    expect(englishNotes.flatMap((note) => [note.title, ...note.items]).join(" ")).not.toMatch(/[А-Яа-яЁё]/);
  });
});
