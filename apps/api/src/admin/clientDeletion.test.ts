import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deleteClientAccount, type ClientDeletionDependencies, type ClientDeletionTarget } from "./clientDeletion";

const adminRoutes = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");

const target: ClientDeletionTarget = {
  id: "user-id",
  telegramId: "client-telegram-id",
  displayName: "Иван",
  firstName: "Иван",
  username: "ivan",
  email: "ivan@example.com"
};

function createDependencies(overrides: Partial<ClientDeletionDependencies> = {}) {
  const steps: string[] = [];
  let currentTarget: ClientDeletionTarget | null = target;
  const dependencies: ClientDeletionDependencies = {
    isOwnerTelegramId: vi.fn(async (telegramId) => telegramId === "owner-telegram-id"),
    findTarget: vi.fn(async () => currentTarget),
    isAdminTelegramId: vi.fn(async () => false),
    collectObjectKeys: vi.fn(async () => {
      steps.push("collect-files");
      return ["avatars/user.webp", "homework/file.pdf", "avatars/user.webp", "", null];
    }),
    deleteDatabaseRecords: vi.fn(async () => {
      steps.push("transaction");
      currentTarget = null;
    }),
    deleteObject: vi.fn(async () => {
      if (steps.at(-1) !== "delete-files") steps.push("delete-files");
    }),
    ...overrides
  };
  return { dependencies, steps };
}

describe("full client deletion", () => {
  it("wires an owner-protected DELETE route with transactional dependent cleanup and audit", () => {
    expect(adminRoutes).toContain('.delete("/stats/users/:telegramId"');
    expect(adminRoutes).toContain("deleteClientAccount(");
    expect(adminRoutes).toContain("previewRole: c.get(\"previewRole\")");
    expect(adminRoutes).toContain('action: "client.deleted"');
    expect(adminRoutes).toContain("tx.delete(userRecurrentSubscriptions)");
    expect(adminRoutes).toContain("tx.delete(paymentOrders)");
    expect(adminRoutes).toContain("tx.delete(individualPaymentOffers)");
    expect(adminRoutes).toContain("tx.delete(users)");
  });

  it("rejects a non-owner and preview role before resolving the target", async () => {
    const regularAdmin = createDependencies({ isOwnerTelegramId: vi.fn(async () => false) });
    await expect(deleteClientAccount({ actorTelegramId: "admin", targetTelegramId: target.telegramId }, regularAdmin.dependencies))
      .resolves.toEqual({ status: "forbidden-actor" });
    expect(regularAdmin.dependencies.findTarget).not.toHaveBeenCalled();

    const previewOwner = createDependencies();
    await expect(deleteClientAccount({ actorTelegramId: "owner-telegram-id", targetTelegramId: target.telegramId, previewRole: "member" }, previewOwner.dependencies))
      .resolves.toEqual({ status: "forbidden-actor" });
    expect(previewOwner.dependencies.findTarget).not.toHaveBeenCalled();
  });

  it("returns not-found without collecting data", async () => {
    const setup = createDependencies({ findTarget: vi.fn(async () => null) });
    await expect(deleteClientAccount({ actorTelegramId: "owner-telegram-id", targetTelegramId: "missing" }, setup.dependencies))
      .resolves.toEqual({ status: "not-found" });
    expect(setup.dependencies.collectObjectKeys).not.toHaveBeenCalled();
  });

  it("protects the owner and every administrator account", async () => {
    const ownerTarget = createDependencies({ isOwnerTelegramId: vi.fn(async () => true) });
    await expect(deleteClientAccount({ actorTelegramId: "owner-telegram-id", targetTelegramId: target.telegramId }, ownerTarget.dependencies))
      .resolves.toEqual({ status: "protected-target" });

    const adminTarget = createDependencies({ isAdminTelegramId: vi.fn(async () => true) });
    await expect(deleteClientAccount({ actorTelegramId: "owner-telegram-id", targetTelegramId: target.telegramId }, adminTarget.dependencies))
      .resolves.toEqual({ status: "protected-target" });
    expect(adminTarget.dependencies.deleteDatabaseRecords).not.toHaveBeenCalled();
  });

  it("deletes database records before each unique client object in both storage targets", async () => {
    const setup = createDependencies();
    await expect(deleteClientAccount({ actorTelegramId: "owner-telegram-id", targetTelegramId: target.telegramId }, setup.dependencies))
      .resolves.toEqual({ status: "deleted", deletedTelegramId: target.telegramId, deletedObjectCount: 2 });

    expect(setup.steps).toEqual(["collect-files", "transaction", "delete-files"]);
    expect(setup.dependencies.deleteDatabaseRecords).toHaveBeenCalledWith({ actorTelegramId: "owner-telegram-id", target });
    expect(setup.dependencies.deleteObject).toHaveBeenCalledTimes(4);
    expect(setup.dependencies.deleteObject).toHaveBeenCalledWith("avatars/user.webp", "primary");
    expect(setup.dependencies.deleteObject).toHaveBeenCalledWith("avatars/user.webp", "reserve");
  });

  it("keeps the account intact and skips object cleanup when the transaction conflicts", async () => {
    const setup = createDependencies({ deleteDatabaseRecords: vi.fn(async () => { throw new Error("foreign key"); }) });
    await expect(deleteClientAccount({ actorTelegramId: "owner-telegram-id", targetTelegramId: target.telegramId }, setup.dependencies))
      .resolves.toEqual({ status: "conflict" });
    expect(setup.dependencies.deleteObject).not.toHaveBeenCalled();
  });

  it("treats missing S3 objects as cleanup failures without restoring the deleted account", async () => {
    const setup = createDependencies({ deleteObject: vi.fn(async () => { throw new Error("missing"); }) });
    await expect(deleteClientAccount({ actorTelegramId: "owner-telegram-id", targetTelegramId: target.telegramId }, setup.dependencies))
      .resolves.toEqual({ status: "deleted", deletedTelegramId: target.telegramId, deletedObjectCount: 2 });
    expect(setup.dependencies.deleteDatabaseRecords).toHaveBeenCalledOnce();
  });
});
