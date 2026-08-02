import { describe, expect, it } from "vitest";
import { putHomeworkObject, resolveHomeworkUploadUrl } from "./homeworkDirectUpload";

describe("homework direct upload", () => {
  it("streams the file through the authenticated same-origin API route", async () => {
    localStorage.setItem("club-preview-mode", "member-active");
    let observed: RequestInit | undefined;
    await putHomeworkObject("/learning/items/lesson/homework/uploads/token", new File(["test"], "result.jpg", { type: "image/jpeg" }), "image/jpeg", async (_input, init) => {
      observed = init;
      return new Response(null, { status: 200 });
    });

    expect(observed?.credentials).toBe("include");
    const headers = new Headers(observed?.headers);
    expect(headers.get("Content-Type")).toBe("image/jpeg");
    expect(headers.get("X-Club-Preview-Mode")).toBe("member-active");
    localStorage.removeItem("club-preview-mode");
  });

  it("resolves the relative upload route through the configured API base", () => {
    expect(resolveHomeworkUploadUrl("/learning/items/lesson/homework/uploads/token", "/api")).toBe("/api/learning/items/lesson/homework/uploads/token");
    expect(resolveHomeworkUploadUrl("/learning/items/lesson/homework/uploads/token", "http://localhost:3000")).toBe("http://localhost:3000/learning/items/lesson/homework/uploads/token");
  });

  it("replaces browser network errors with a clear Russian message", async () => {
    await expect(putHomeworkObject(
      "/learning/items/lesson/homework/uploads/token",
      new File(["test"], "result.jpg", { type: "image/jpeg" }),
      "image/jpeg",
      async () => { throw new TypeError("Failed to fetch"); }
    )).rejects.toThrow("Не удалось загрузить файл. Проверьте интернет и попробуйте ещё раз.");
  });
});
