import { describe, expect, it } from "vitest";
import { adminLoginIpsResponseSchema } from "./index";

describe("admin login IP contracts", () => {
  it("parses unique login IP history", () => {
    const parsed = adminLoginIpsResponseSchema.parse({
      loginIps: [
        {
          id: "8ac124e8-13cb-4e19-8370-4e1a41d833f1",
          ipAddress: "2001:db8::1",
          firstSeenAt: "2026-07-11T10:00:00.000Z",
          lastSeenAt: "2026-07-11T12:00:00.000Z",
          loginCount: 3
        }
      ]
    });

    expect(parsed.loginIps[0]?.ipAddress).toBe("2001:db8::1");
    expect(parsed.loginIps[0]?.loginCount).toBe(3);
  });
});
