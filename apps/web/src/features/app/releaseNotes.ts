import { appVersion, appVersionUpdatedAt } from "./version";
import { currentRelease } from "@club/shared";
import { releaseHistory } from "./releaseHistory";

export type ReleaseNote = {
  version: string;
  updatedAt: string;
  title: string;
  items: string[];
};

export const releaseNotes: ReleaseNote[] = [
  {
    version: appVersion,
    updatedAt: appVersionUpdatedAt,
    title: currentRelease.title,
    items: [...currentRelease.items]
  },
  ...releaseHistory
];

export function getReleaseNoteByVersion(version: string) {
  return releaseNotes.find((note) => note.version === version) ?? null;
}

const currentEnglishRelease: Pick<ReleaseNote, "title" | "items"> = {
  title: "Reliable Lava prices and separate support stats",
  items: [
    "Lava catalog prices are stored and validated separately for every currency and billing period.",
    "The tariff editor refreshes current amounts while preserving enabled currencies in a compact layout.",
    "Support metrics now appear as four independent cards."
  ]
};

export function getLocalizedReleaseNotes(locale: "ru" | "en") {
  if (locale === "ru") return releaseNotes;
  return releaseNotes.map((note) =>
    note.version === appVersion
      ? { ...note, ...currentEnglishRelease }
      : {
          ...note,
          title: `Version ${note.version}`,
          items: ["Details for this earlier release are available in the Russian changelog."]
        }
  );
}
