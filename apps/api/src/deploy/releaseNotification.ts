type ReleaseDescriptor = {
  version: string;
  title: string;
  items: readonly string[];
};

type ReleaseNotificationInput = {
  userId: string;
  kind: "system";
  title: string;
  body: string;
  source: "release";
  pushUrl: "/notifications";
};

type ReleaseNotificationDependencies = {
  findOwnerUserId: () => Promise<string | null>;
  hasReleaseNotification: (userId: string, title: string) => Promise<boolean>;
  createNotification: (input: ReleaseNotificationInput) => Promise<unknown>;
};

export async function ensureOwnerReleaseNotification(
  release: ReleaseDescriptor,
  dependencies: ReleaseNotificationDependencies
) {
  const userId = await dependencies.findOwnerUserId();
  if (!userId) {
    return { created: false as const, reason: "owner-not-found" as const };
  }

  const title = `Обновление v${release.version} установлено`;
  if (await dependencies.hasReleaseNotification(userId, title)) {
    return { created: false as const, reason: "already-notified" as const };
  }

  await dependencies.createNotification({
    userId,
    kind: "system",
    title,
    body: `${release.title}. ${release.items.join(" ")}`,
    source: "release",
    pushUrl: "/notifications"
  });
  return { created: true as const, reason: "created" as const };
}
