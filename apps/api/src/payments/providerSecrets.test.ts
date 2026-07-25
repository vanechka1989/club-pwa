import { afterEach, describe, expect, it, vi } from "vitest";

describe("payment provider secret storage", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("encrypts with a random AES-256-GCM nonce and decrypts the value", async () => {
    vi.stubEnv("PAYMENT_CONFIG_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const { decryptProviderSecret, encryptProviderSecret } = await import("./providerSecrets");

    const first = encryptProviderSecret("lava-key");
    const second = encryptProviderSecret("lava-key");

    expect(first).toMatch(/^enc:v1:/);
    expect(second).not.toBe(first);
    expect(decryptProviderSecret(first)).toBe("lava-key");
    expect(decryptProviderSecret(second)).toBe("lava-key");
  });

  it("reads legacy plaintext Prodamus secrets during migration", async () => {
    vi.stubEnv("PAYMENT_CONFIG_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const { decryptProviderSecret } = await import("./providerSecrets");

    expect(decryptProviderSecret("legacy-prodamus-secret")).toBe("legacy-prodamus-secret");
  });
});
