import { afterEach, describe, expect, it, vi } from "vitest";

describe("environment config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps email dev login codes disabled unless explicitly enabled", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgres://club:club@localhost:5432/club");
    delete process.env.AUTH_DEV_CODE_ENABLED;

    const { env } = await import("./env");

    expect(env.AUTH_DEV_CODE_ENABLED).toBe(false);
  });
});
