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
  title: "Organized learning analytics",
  items: [
    "Learning metrics now live in one overview, while tests and homework have their own balanced summary block.",
    "Materials share one consistent structure with compact outcome labels and a visual quick-exit indicator.",
    "The new composition keeps readable spacing across phones, tablets, and wide screens."
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
