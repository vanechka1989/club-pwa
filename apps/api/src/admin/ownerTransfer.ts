import type { UserRole } from "@club/shared";

type TransferValidationInput = {
  currentOwnerTelegramId: string;
  targetTelegramId: string;
  targetRole: UserRole;
};

type TransferValidationResult =
  | { ok: true }
  | {
      ok: false;
      status: 400;
      error: string;
    };

export function validateOwnerTransferTarget(input: TransferValidationInput): TransferValidationResult {
  if (input.targetTelegramId === input.currentOwnerTelegramId) {
    return { ok: false, status: 400, error: "Нельзя передать клуб самому себе." };
  }

  if (input.targetRole !== "admin") {
    return { ok: false, status: 400, error: "Передать клуб можно только администратору." };
  }

  return { ok: true };
}
