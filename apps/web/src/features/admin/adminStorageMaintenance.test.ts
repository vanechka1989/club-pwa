import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panel = readFileSync(resolve(process.cwd(), "src/features/admin/AdminServerPanel.vue"), "utf8");

describe("admin server storage maintenance", () => {
  it("shows disk capacity and the last automatic maintenance result", () => {
    expect(panel).toContain('class="ops-card ops-storage-card"');
    expect(panel).toContain('role="progressbar"');
    expect(panel).toContain("Свободно");
    expect(panel).toContain("Последнее обслуживание");
    expect(panel).toContain("Освобождено");
  });

  it("explains the main storage categories without offering destructive cleanup", () => {
    expect(panel).toContain("Docker-образы");
    expect(panel).toContain("Кэш сборки");
    expect(panel).toContain("Системные логи");
    expect(panel).toContain("Данные приложения");
    expect(panel).not.toContain("Очистить диск");
  });

  it("uses the same warning boundary as host monitoring and a mobile-safe layout", () => {
    expect(panel).toContain("usedPercent >= 70");
    expect(panel).toContain("usedPercent >= 85");
    expect(panel).toContain(".storage-breakdown{grid-template-columns:1fr}");
  });
});
