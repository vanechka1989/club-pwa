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
  title: "Real tariffs in showcase analytics",
  items: [
    "Showcase analytics now uses the real names and kinds of payment products configured for the club.",
    "Fictional payments, customers and revenue are distributed across the club's configured payment providers with consistent totals.",
    "Every analytics detail screen replaces the period chip with a Generate button while showcase mode is active."
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
