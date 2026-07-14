import { describe, expect, it } from "vitest";
import { isValidMultipartPartSize, maxMultipartPartSizeBytes } from "./s3MultipartPart";

describe("multipart upload part validation", () => {
  it("accepts non-empty parts up to the configured chunk size", () => {
    expect(isValidMultipartPartSize(1)).toBe(true);
    expect(isValidMultipartPartSize(maxMultipartPartSizeBytes)).toBe(true);
    expect(isValidMultipartPartSize(0)).toBe(false);
    expect(isValidMultipartPartSize(maxMultipartPartSizeBytes + 1)).toBe(false);
  });
});
