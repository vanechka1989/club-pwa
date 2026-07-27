import { describe, expect, it, vi } from "vitest";
import { buildRuntimeErrorPayload, installVueErrorHandler } from "./errorTrackerCapture";

describe("browser error tracker capture", () => {
  it("adds release, route and PWA/device context without URL parameters", () => {
    const payload = buildRuntimeErrorPayload(new Error("Card failed"), "render LessonCard", {
      release: "5.73",
      url: "https://club.example/modules?token=secret#lesson",
      displayMode: "standalone",
      online: false,
      installationId: "device-123",
      userAgent: "Mobile Browser",
      platform: "Android",
      viewport: { width: 360, height: 800 }
    });
    expect(payload.route).toBe("/modules");
    expect(payload.release).toBe("5.73");
    expect(payload.stack).toContain("Card failed");
    expect(payload.detail).toEqual({ component: "render LessonCard" });
    expect(payload.displayMode).toBe("standalone");
  });

  it("installs a Vue error handler that reports without rethrowing", async () => {
    const report = vi.fn().mockResolvedValue(undefined);
    const app = { config: {} as { errorHandler?: (error: unknown, instance: unknown, info: string) => void } };
    installVueErrorHandler(app, report, () => ({
      release: "5.73", url: "https://club.example/", displayMode: "browser", online: true,
      installationId: null, userAgent: "Browser", platform: "Linux", viewport: { width: 1280, height: 720 }
    }));
    app.config.errorHandler?.(new Error("Render failed"), null, "render");
    await Promise.resolve();
    expect(report).toHaveBeenCalledOnce();
  });
});
