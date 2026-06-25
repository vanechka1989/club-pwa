import { describe, expect, it } from "vitest";
import { validateOwnerTransferTarget } from "./ownerTransfer";

describe("validateOwnerTransferTarget", () => {
  it("allows transferring ownership to another admin", () => {
    expect(
      validateOwnerTransferTarget({
        currentOwnerTelegramId: "100",
        targetTelegramId: "200",
        targetRole: "admin"
      })
    ).toEqual({ ok: true });
  });

  it("rejects transferring ownership to yourself", () => {
    expect(
      validateOwnerTransferTarget({
        currentOwnerTelegramId: "100",
        targetTelegramId: "100",
        targetRole: "owner"
      })
    ).toEqual({ ok: false, status: 400, error: "Нельзя передать клуб самому себе." });
  });

  it("rejects transferring ownership to a member", () => {
    expect(
      validateOwnerTransferTarget({
        currentOwnerTelegramId: "100",
        targetTelegramId: "300",
        targetRole: "member"
      })
    ).toEqual({ ok: false, status: 400, error: "Передать клуб можно только администратору." });
  });
});
