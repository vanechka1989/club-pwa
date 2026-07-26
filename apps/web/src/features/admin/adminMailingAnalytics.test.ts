import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "@/test/appStyles";

describe("admin mailing engagement analytics", () => {
  const shellSource = readFileSync(resolve(process.cwd(), "src/features/admin/AdminSection.vue"), "utf8");
  const panelSource = readFileSync(resolve(process.cwd(), "src/features/admin/AdminMailingsPanel.vue"), "utf8");
  const styles = readAppStyles("admin");

  it("loads and presents the full engagement report", () => {
    expect(shellSource).toContain("getAdminMailingAnalytics");
    expect(shellSource).toContain("getAdminMailingAnalyticsRecipients");
    expect(panelSource).toContain("Аналитика");
    expect(panelSource).toContain("Open rate");
    expect(panelSource).toContain("CTR");
    expect(panelSource).toContain("CTOR");
    expect(panelSource).toContain("Открытия Email приблизительные");
    expect(panelSource).toContain("Динамика");
    expect(panelSource).toContain("Популярные ссылки");
    expect(panelSource).toContain("Получатели");
    expect(panelSource).toContain("Отслеживание вовлечённости появилось в версии 5.26");
  });

  it("provides loading, error, empty, filter and pagination states", () => {
    expect(panelSource).toContain("mailingAnalyticsLoading");
    expect(panelSource).toContain("mailingAnalyticsError");
    expect(panelSource).toContain("mailingAnalyticsRecipientStatus");
    expect(panelSource).toContain("mailingAnalyticsRecipientChannel");
    expect(panelSource).toContain("Показать ещё");
    expect(panelSource).toContain("По выбранным фильтрам получателей нет.");
  });

  it("uses mobile-first wrapping and touch-sized controls", () => {
    expect(styles).toMatch(/\.admin-mailing-analytics-kpis\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(styles).toMatch(/\.admin-mailing-analytics-filters[^}]*flex-wrap:\s*wrap/s);
    expect(styles).toMatch(/\.admin-mailing-analytics-filters[^}]*min-height:\s*44px/s);
    expect(styles).toMatch(/@media\s*\(min-width:\s*48rem\)[\s\S]*\.admin-mailing-analytics-kpis/s);
  });
});
