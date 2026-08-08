import { describe, expect, it } from "vitest";
import type { CurrentAccess } from "@club/shared";
import {
  getProfileAccessDateText,
  getProfileAccessMetaText,
  maskProfileEmail,
  shouldShowProfilePaymentAction
} from "./profileAccess";

const now = new Date("2026-08-04T12:00:00.000Z");

describe("profile access presentation", () => {
  it.each([
    ["2026-08-08T12:00:00.000Z", false],
    ["2026-08-07T12:00:00.000Z", true],
    ["2026-08-04T18:00:00.000Z", true],
    ["2026-08-03T12:00:00.000Z", true]
  ])("shows renewal only within the final three days (%s)", (expiresAt, expected) => {
    expect(shouldShowProfilePaymentAction({
      isMember: true,
      expiresAt,
      source: "one_time",
      now
    })).toBe(expected);
  });

  it("hides renewal for active auto-renewal and shows payment for inactive access", () => {
    expect(shouldShowProfilePaymentAction({ isMember: true, expiresAt: now.toISOString(), source: "recurrent", now })).toBe(false);
    expect(shouldShowProfilePaymentAction({ isMember: true, expiresAt: null, source: "lifetime", now })).toBe(false);
    expect(shouldShowProfilePaymentAction({ isMember: false, expiresAt: null, source: null, now })).toBe(true);
  });

  it("masks email without producing an empty blurred block", () => {
    expect(maskProfileEmail("ivan.petrov@example.com")).toBe("i•••@example.com");
    expect(maskProfileEmail("a@example.com")).toBe("a•••@example.com");
    expect(maskProfileEmail(null)).toBe("Не указан");
  });

  it("formats paid, recurring, gift and referral access details", () => {
    const base = { expiresAt: "2031-01-01T00:00:00.000Z", nextPaymentAt: null, bonusDays: null };
    const oneTime: CurrentAccess = { ...base, source: "one_time", title: "Клуб Premium", accessDays: 30 };
    const recurrent: CurrentAccess = { ...base, source: "recurrent", title: "Клуб Premium", accessDays: 30, nextPaymentAt: base.expiresAt };
    const gift: CurrentAccess = { ...base, source: "gift", title: "Подарочная подписка", accessDays: null };
    const referral: CurrentAccess = { ...base, source: "referral", title: "Реферальный бонус", accessDays: null, bonusDays: 14 };
    const lifetime: CurrentAccess = { ...base, source: "lifetime", title: "Постоянный доступ", accessDays: null, expiresAt: null };

    expect(getProfileAccessMetaText(oneTime, "ru")).toBe("Разовый платёж · 30 дней");
    expect(getProfileAccessMetaText(recurrent, "ru")).toBe("Автопродление · каждые 30 дней");
    expect(getProfileAccessMetaText(gift, "ru")).toBe("Выдана администратором");
    expect(getProfileAccessMetaText(referral, "ru")).toBe("Добавлено 14 дней");
    expect(getProfileAccessMetaText(lifetime, "ru")).toBe("Постоянный доступ");
    expect(getProfileAccessDateText(recurrent, "ru")).toBe("Следующее списание 1 января 2031 г.");
    expect(getProfileAccessDateText(oneTime, "ru")).toBe("до 1 января 2031 г.");
    expect(getProfileAccessDateText(lifetime, "ru")).toBe("Без ограничения срока");
  });
});
