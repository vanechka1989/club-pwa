import { describe, expect, it, vi } from "vitest";
import { startServiceWorkerLifecycle, type ServiceWorkerLifecycleOptions } from "./serviceWorkerLifecycle";

function createRegistration(update: () => Promise<void>) {
  return {
    waiting: null,
    installing: null,
    update,
    addEventListener: vi.fn()
  };
}

function createEnvironment(register: ServiceWorkerLifecycleOptions["serviceWorker"]["register"]) {
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  Object.defineProperty(documentTarget, "visibilityState", { configurable: true, value: "visible" });
  const serviceWorkerEvents = new EventTarget();
  const reload = vi.fn();

  const options: ServiceWorkerLifecycleOptions = {
    serviceWorker: {
      register,
      addEventListener: serviceWorkerEvents.addEventListener.bind(serviceWorkerEvents)
    },
    windowTarget,
    documentTarget,
    reload
  };

  return { options, windowTarget, documentTarget, serviceWorkerEvents, reload };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("service worker lifecycle", () => {
  it("contains a failed registration and retries when the browser comes online", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = createRegistration(update);
    const register = vi
      .fn()
      .mockRejectedValueOnce(new Error("Script /sw.js load failed"))
      .mockResolvedValueOnce(registration);
    const { options, windowTarget } = createEnvironment(register);

    startServiceWorkerLifecycle(options);
    await flushPromises();

    expect(register).toHaveBeenCalledTimes(1);

    windowTarget.dispatchEvent(new Event("online"));
    await flushPromises();

    expect(register).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("contains a failed update and retries it on the next online event", async () => {
    const update = vi.fn().mockRejectedValueOnce(new Error("load failed")).mockResolvedValueOnce(undefined);
    const register = vi.fn().mockResolvedValue(createRegistration(update));
    const { options, windowTarget } = createEnvironment(register);

    startServiceWorkerLifecycle(options);
    await flushPromises();

    expect(update).toHaveBeenCalledTimes(1);

    windowTarget.dispatchEvent(new Event("online"));
    await flushPromises();

    expect(register).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("does not start overlapping update requests", async () => {
    let resolveUpdate: (() => void) | undefined;
    const update = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveUpdate = resolve;
        })
    );
    const register = vi.fn().mockResolvedValue(createRegistration(update));
    const { options, windowTarget } = createEnvironment(register);

    startServiceWorkerLifecycle(options);
    await flushPromises();
    windowTarget.dispatchEvent(new Event("online"));
    windowTarget.dispatchEvent(new Event("online"));

    expect(update).toHaveBeenCalledTimes(1);

    resolveUpdate?.();
    await flushPromises();
    windowTarget.dispatchEvent(new Event("online"));
    await flushPromises();

    expect(update).toHaveBeenCalledTimes(2);
  });

  it("checks for an update when the app becomes visible", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn().mockResolvedValue(createRegistration(update));
    const { options, documentTarget } = createEnvironment(register);

    startServiceWorkerLifecycle(options);
    await flushPromises();
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();

    expect(update).toHaveBeenCalledTimes(2);
  });
});
