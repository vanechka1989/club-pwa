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
  title: "One visual system for every metric",
  items: [
    "Revenue and new clients now use the same circular visual treatment as activity, payments, and learning progress.",
    "All six primary metrics, including period messages, sit in one balanced block with two equal rows of three.",
    "Every circular metric opens its detailed section while preserving the real meaning of values without invented percentages."
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
