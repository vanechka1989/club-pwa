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
  title: "Client deletion permission fix",
  items: [
    "The real club owner can now delete an ordinary client while a developer or another preview mode is enabled.",
    "The server checks the real owner role, so a temporary preview role no longer blocks a confirmed deletion.",
    "Administrators still cannot delete clients, and owner or administrator accounts remain protected."
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
