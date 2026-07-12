import { describe, expect, it } from "vitest";
import { appVersion } from "./version";
import { getReleaseNoteByVersion, releaseNotes } from "./releaseNotes";

describe("release notes", () => {
  it("publishes the communication polish as version 3.85", () => {
    expect(appVersion).toBe("3.85");
    expect(releaseNotes[0]?.title).toBe("Единый интерфейс профиля и общения");
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
});
