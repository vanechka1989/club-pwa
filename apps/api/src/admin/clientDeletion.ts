export type ClientDeletionTarget = {
  id: string;
  telegramId: string;
  displayName: string | null;
  firstName: string | null;
  username: string | null;
  email: string | null;
  avatarObjectKey?: string | null;
};

export type ClientDeletionDependencies = {
  isOwnerTelegramId: (telegramId: string) => Promise<boolean>;
  findTarget: (telegramId: string) => Promise<ClientDeletionTarget | null>;
  isAdminTelegramId: (telegramId: string) => Promise<boolean>;
  collectObjectKeys: (target: ClientDeletionTarget) => Promise<Array<string | null | undefined>>;
  deleteDatabaseRecords: (input: { actorTelegramId: string; target: ClientDeletionTarget }) => Promise<void>;
  deleteObject: (key: string, target: "primary" | "reserve") => Promise<void>;
};

export type ClientDeletionResult =
  | { status: "deleted"; deletedTelegramId: string; deletedObjectCount: number }
  | { status: "not-found" }
  | { status: "forbidden-actor" }
  | { status: "protected-target" }
  | { status: "conflict" };

export async function deleteClientAccount(
  input: { actorTelegramId: string; targetTelegramId: string; previewRole?: string | null },
  dependencies: ClientDeletionDependencies
): Promise<ClientDeletionResult> {
  if (input.previewRole || !(await dependencies.isOwnerTelegramId(input.actorTelegramId))) {
    return { status: "forbidden-actor" };
  }

  const target = await dependencies.findTarget(input.targetTelegramId);
  if (!target) {
    return { status: "not-found" };
  }

  if (await dependencies.isOwnerTelegramId(target.telegramId) || await dependencies.isAdminTelegramId(target.telegramId)) {
    return { status: "protected-target" };
  }

  const objectKeys = [...new Set(
    (await dependencies.collectObjectKeys(target))
      .filter((key): key is string => typeof key === "string")
      .map((key) => key.trim())
      .filter(Boolean)
  )];

  try {
    await dependencies.deleteDatabaseRecords({ actorTelegramId: input.actorTelegramId, target });
  } catch {
    return { status: "conflict" };
  }

  await Promise.allSettled(
    objectKeys.flatMap((key) => [
      dependencies.deleteObject(key, "primary"),
      dependencies.deleteObject(key, "reserve")
    ])
  );

  return { status: "deleted", deletedTelegramId: target.telegramId, deletedObjectCount: objectKeys.length };
}
