import { describe, expect, it } from "vitest";
import { paymentRedirectNotice } from "./paymentMessages";

describe("payment messages", () => {
  it("uses the current payment redirect notice wording", () => {
    expect(paymentRedirectNotice).toBe(
      "После оплаты зачисление обычно занимает от 5 до 15 минут. Вернитесь в приложение, доступ обновится автоматически."
    );
    expect(paymentRedirectNotice.match(/После оплаты/g)).toHaveLength(1);
    expect(paymentRedirectNotice).not.toContain("миниапку");
  });
});
