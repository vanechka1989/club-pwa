import { describe, expect, it } from "vitest";
import { buildClientErrorRecord, createClientErrorRateLimiter } from "./clientErrors";

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

  it("rate-limits repeated public client error reports", () => {
    const limiter = createClientErrorRateLimiter({ maxEvents: 2, windowMs: 1000 });

    expect(limiter.consume("ip:1", 1000)).toBe(true);
    expect(limiter.consume("ip:1", 1200)).toBe(true);
    expect(limiter.consume("ip:1", 1300)).toBe(false);
    expect(limiter.consume("ip:1", 2101)).toBe(true);
  });

  it("labels a lesson upload failure separately in the server log", () => {
    const record = buildClientErrorRecord({
      kind: "lesson-upload",
      message: "Соединение прервалось",
      url: "https://club.example/modules",
      detail: { code: "UPLOAD_CONNECTION_CLOSED", stage: "Дополнительный материал 2", attempts: 3 }
    });

    expect(record.title).toBe("Ошибка загрузки урока");
    expect(record.error).toContain("UPLOAD_CONNECTION_CLOSED");
    expect(record.error).toContain("Дополнительный материал 2");
  });
});
