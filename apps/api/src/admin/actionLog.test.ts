import { describe, expect, it } from "vitest";
import { sanitizeAdminActionMetadata } from "./actionLog";

describe("admin action log helpers", () => {
  it("redacts secret-like metadata values before storing logs", () => {
    expect(
      sanitizeAdminActionMetadata({
        endpoint: "https://s3.example.com",
        accessKeyId: "public-ish",
        secretAccessKey: "secret",
        nested: {
          apiToken: "token"
        }
      })
    ).toEqual({
      endpoint: "https://s3.example.com",
      accessKeyId: "[redacted]",
      secretAccessKey: "[redacted]",
      nested: {
        apiToken: "[redacted]"
      }
    });
  });
});
