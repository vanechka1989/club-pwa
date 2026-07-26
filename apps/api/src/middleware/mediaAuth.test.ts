import { describe, expect, it } from "vitest";
import { canAuthenticateWithoutPwaHeader } from "./authPolicy";

describe("media session authentication", () => {
  it("allows cookie authentication for protected local media and SSE only", () => {
    expect(canAuthenticateWithoutPwaHeader("/uploads/community/photo.webp")).toBe(true);
    expect(canAuthenticateWithoutPwaHeader("/community/events", "1")).toBe(true);
    expect(canAuthenticateWithoutPwaHeader("/community/events")).toBe(false);
    expect(canAuthenticateWithoutPwaHeader("/me")).toBe(false);
  });
});
