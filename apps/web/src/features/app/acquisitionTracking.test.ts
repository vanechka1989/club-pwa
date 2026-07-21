import { describe, expect, it, vi } from "vitest";
import {
  captureAcquisitionLanding,
  consumePostAuthDestination,
  getAcquisitionVisitorId,
  getPostAuthDestinationPath
} from "./acquisitionTracking";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key)
  } as unknown as Storage;
}

describe("acquisition landing tracking", () => {
  it("keeps one first-party visitor id and records a marked landing", async () => {
    const storage = memoryStorage();
    const record = vi.fn().mockResolvedValue({ accepted: true, destination: { kind: "billing" as const } });
    expect(getAcquisitionVisitorId(storage, () => "0b70f8c3-ea3d-4544-9fe7-1be6e495cadc")).toBe("0b70f8c3-ea3d-4544-9fe7-1be6e495cadc");
    await captureAcquisitionLanding("?aid=telegram-july&utm_source=telegram&ref=friend", storage, record);
    expect(record).toHaveBeenCalledWith({ aid: "telegram-july", visitorId: "0b70f8c3-ea3d-4544-9fe7-1be6e495cadc" });
    expect(consumePostAuthDestination(storage)).toEqual({ kind: "billing" });
    expect(consumePostAuthDestination(storage)).toBeNull();
  });

  it("silently ignores unmarked and failed landings", async () => {
    const storage = memoryStorage();
    const record = vi.fn().mockRejectedValue(new Error("offline"));
    await expect(captureAcquisitionLanding("?ref=friend", storage, record)).resolves.toBeNull();
    await expect(captureAcquisitionLanding("?aid=telegram-july", storage, record)).resolves.toBeNull();
  });

  it("maps only internal destinations", () => {
    expect(getPostAuthDestinationPath({ kind: "home" })).toBe("/profile");
    expect(getPostAuthDestinationPath({ kind: "billing" })).toBe("/payments");
    expect(getPostAuthDestinationPath({ kind: "module", moduleId: "f08ac73a-4ca1-4ed2-b6c2-47cd32b45290" })).toBe("/learning?module=f08ac73a-4ca1-4ed2-b6c2-47cd32b45290");
  });
});
