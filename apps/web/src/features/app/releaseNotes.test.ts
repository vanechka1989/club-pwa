import { describe, expect, it } from "vitest";
import { appVersion } from "./version";
import { getLocalizedReleaseNotes, getReleaseNoteByVersion, releaseNotes } from "./releaseNotes";

describe("release notes", () => {
  it("publishes readable chat reactions as version 5.27", () => {
    expect(appVersion).toBe("5.27");
    expect(releaseNotes[0]?.title).toBe("Читаемые реакции в чате");
    expect(releaseNotes[0]?.items.join(" ")).toContain("Android и iPhone");

    const analyticsRelease = releaseNotes.find((note) => note.version === "5.26");
    expect(analyticsRelease?.title).toBe("Аналитика рассылок");
    expect(analyticsRelease?.items.join(" ")).toContain("Open rate");

    const reliableDeliveryRelease = releaseNotes.find((note) => note.version === "5.25");
    expect(reliableDeliveryRelease?.title).toBe("Надёжная доставка рассылок");
    expect(reliableDeliveryRelease?.items.join(" ")).toContain("Повторить ошибки");

    const htmlMailingRelease = releaseNotes.find((note) => note.version === "5.24");
    expect(htmlMailingRelease?.title).toBe("HTML-форматирование рассылок");
    expect(htmlMailingRelease?.items.join(" ")).toContain("HTML-код");

    const reliableSaveRelease = releaseNotes.find((note) => note.version === "5.23");
    expect(reliableSaveRelease?.title).toBe("Надёжное сохранение уроков");
    expect(reliableSaveRelease?.items.join(" ")).toContain("проверит сервер");

    const photoMenuRelease = releaseNotes.find((note) => note.version === "5.22");
    expect(photoMenuRelease?.title).toBe("Ровные отступы меню фото");
    expect(photoMenuRelease?.items.join(" ")).toContain("справа");

    const avatarDraftRelease = releaseNotes.find((note) => note.version === "5.21");
    expect(avatarDraftRelease?.title).toBe("Предпросмотр фото до сохранения");
    expect(avatarDraftRelease?.items.join(" ")).toContain("Сохранить");

    const previousRelease = releaseNotes.find((note) => note.version === "5.20");
    expect(previousRelease?.title).toBe("Возвращено меню фото профиля");
    expect(previousRelease?.items.join(" ")).toContain("Настроить кадр");

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
    expect(englishNotes[0]?.title).toBe("Readable chat reactions");
    expect(englishNotes.flatMap((note) => [note.title, ...note.items]).join(" ")).not.toMatch(/[А-Яа-яЁё]/);
  });
});
