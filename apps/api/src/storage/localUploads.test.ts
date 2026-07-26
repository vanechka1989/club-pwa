import { describe, expect, it } from "vitest";
import { localUploadResponseHeaders } from "./localUploadHeaders";

describe("local upload response headers", () => {
  it("prevents shared and offline caches from retaining authenticated media", () => {
    expect(localUploadResponseHeaders("image/webp")).toEqual({
      "Cache-Control": "private, no-store",
      "Content-Type": "image/webp",
      Vary: "Cookie"
    });
  });
});
