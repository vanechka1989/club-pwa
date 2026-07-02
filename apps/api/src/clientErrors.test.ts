import { describe, expect, it } from "vitest";
import { buildClientErrorRecord } from "./clientErrors";

describe("client error diagnostics", () => {
  it("converts a frontend boot failure into an understandable server log entry", () => {
    const record = buildClientErrorRecord({
      kind: "blank-screen",
      message: "Vue app did not mount",
      url: "https://club.example/",
      userAgent: "Telegram-Android/12.8 Chrome/92",
      platform: "android",
      viewport: { width: 360, height: 796 },
      detail: { file: "/assets/index.js", line: 12 }
    });

    expect(record).toMatchObject({
      title: "Ошибка запуска приложения",
      method: "CLIENT",
      path: "https://club.example/",
      status: null
    });
    expect(record.error).toContain("blank-screen");
    expect(record.error).toContain("Vue app did not mount");
    expect(record.error).toContain("Telegram-Android/12.8 Chrome/92");
    expect(record.error).toContain("360x796");
  });
});
