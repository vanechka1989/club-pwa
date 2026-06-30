import { describe, expect, it } from "vitest";
import { normalizeS3ObjectKey, normalizeS3ObjectPrefix } from "./s3Object";

describe("S3 object helpers", () => {
  it("normalizes object prefixes for listing", () => {
    expect(normalizeS3ObjectPrefix("/learning//")).toBe("learning/");
    expect(normalizeS3ObjectPrefix(" support/tickets ")).toBe("support/tickets/");
    expect(normalizeS3ObjectPrefix("")).toBe("");
  });

  it("rejects empty keys and folder keys for destructive actions", () => {
    expect(normalizeS3ObjectKey(" /learning/file.webp ")).toBe("learning/file.webp");
    expect(() => normalizeS3ObjectKey("")).toThrow("S3 object key is required");
    expect(() => normalizeS3ObjectKey("learning/")).toThrow("S3 object key must point to a file");
  });
});
