import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { deleteWebPushSubscription, saveWebPushSubscription, getWebPushPublicKey } = vi.hoisted(() => ({
  deleteWebPushSubscription: vi.fn(),
  saveWebPushSubscription: vi.fn(),
  getWebPushPublicKey: vi.fn()
}));

vi.mock("@/api/client", () => ({
  clearAppNotifications: vi.fn(),
  deleteWebPushSubscription,
  getAppNotifications: vi.fn(),
  getWebPushPublicKey,
  markAppNotificationsRead: vi.fn(),
  saveWebPushSubscription
}));

import { useNotificationsStore } from "./notifications";

function installPushBrowser(subscription: PushSubscription | null) {
  const getSubscription = vi.fn().mockResolvedValue(subscription);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager: { getSubscription, subscribe: vi.fn() } }) }
  });
  Object.defineProperty(window, "PushManager", { configurable: true, value: class PushManager {} });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { permission: "granted", requestPermission: vi.fn().mockResolvedValue("granted") }
  });
  return { getSubscription };
}

describe("device browser push state", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("reports disabled when this device has no subscription", async () => {
    installPushBrowser(null);
    const store = useNotificationsStore();
    await store.refreshBrowserPushStatus();
    expect(store.pushStatus).toBe("disabled");
  });

  it("reports enabled when this device has a subscription", async () => {
    installPushBrowser({} as PushSubscription);
    const store = useNotificationsStore();
    await store.refreshBrowserPushStatus();
    expect(store.pushStatus).toBe("enabled");
  });

  it("revokes and unsubscribes only the current device", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    const toJSON = vi.fn().mockReturnValue({ endpoint: "https://push.example/device", keys: { p256dh: "p", auth: "a" } });
    const subscription = { unsubscribe, toJSON } as unknown as PushSubscription;
    const browser = installPushBrowser(subscription);
    browser.getSubscription.mockResolvedValueOnce(subscription).mockResolvedValueOnce(null);
    deleteWebPushSubscription.mockResolvedValue({ ok: true });

    const store = useNotificationsStore();
    await store.disableBrowserPush();

    expect(deleteWebPushSubscription).toHaveBeenCalledWith(toJSON());
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(store.pushStatus).toBe("disabled");
    expect(store.items.at(-1)?.message).toBe("Push отключены. Оповещения больше не будут приходить на это устройство.");
  });
});
