import { describe, expect, it } from "vitest";
import { ensureOwnerReleaseNotification } from "./releaseNotification";

const release = {
  version: "5.56",
  title: "Удобное управление оплатой",
  items: [
    "Создание тарифов и выбор платёжной системы стали понятнее.",
    "Каталог Lava теперь управляется прямо в приложении."
  ]
};

describe("release notification", () => {
  it("creates one owner system notification for a new release", async () => {
    const created: unknown[] = [];
    const result = await ensureOwnerReleaseNotification(release, {
      findOwnerUserId: async () => "owner-id",
      hasReleaseNotification: async () => false,
      createNotification: async (input) => {
        created.push(input);
      }
    });

    expect(result).toEqual({ created: true, reason: "created" });
    expect(created).toEqual([{
      userId: "owner-id",
      kind: "system",
      title: "Обновление v5.56 установлено",
      body: "Удобное управление оплатой. Создание тарифов и выбор платёжной системы стали понятнее. Каталог Lava теперь управляется прямо в приложении.",
      source: "release",
      pushUrl: "/notifications"
    }]);
  });

  it("does not duplicate a notification for the same release", async () => {
    let createCount = 0;
    const result = await ensureOwnerReleaseNotification(release, {
      findOwnerUserId: async () => "owner-id",
      hasReleaseNotification: async () => true,
      createNotification: async () => {
        createCount += 1;
      }
    });

    expect(result).toEqual({ created: false, reason: "already-notified" });
    expect(createCount).toBe(0);
  });
});
