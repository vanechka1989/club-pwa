import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin mailing engagement analytics", () => {
  const source = readFileSync(resolve(process.cwd(), "src/features/admin/AdminSection.vue"), "utf8");
  const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

  it("loads and presents the full engagement report", () => {
    expect(source).toContain("getAdminMailingAnalytics");
    expect(source).toContain("getAdminMailingAnalyticsRecipients");
    expect(source).toContain("Аналитика");
    expect(source).toContain("Open rate");
    expect(source).toContain("CTR");
    expect(source).toContain("CTOR");
    expect(source).toContain("Открытия Email приблизительные");
    expect(source).toContain("Динамика");
    expect(source).toContain("Популярные ссылки");
    expect(source).toContain("Получатели");
    expect(source).toContain("Отслеживание вовлечённости появилось в версии 5.26");
  });

  it("provides loading, error, empty, filter and pagination states", () => {
    expect(source).toContain("mailingAnalyticsLoading");
    expect(source).toContain("mailingAnalyticsError");
    expect(source).toContain("mailingAnalyticsRecipientStatus");
    expect(source).toContain("mailingAnalyticsRecipientChannel");
    expect(source).toContain("Показать ещё");
    expect(source).toContain("По выбранным фильтрам получателей нет.");
  });

  it("uses mobile-first wrapping and touch-sized controls", () => {
    expect(styles).toMatch(/\.admin-mailing-analytics-kpis\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
    expect(styles).toMatch(/\.admin-mailing-analytics-filters[^}]*flex-wrap:\s*wrap/s);
    expect(styles).toMatch(/\.admin-mailing-analytics-filters[^}]*min-height:\s*44px/s);
    expect(styles).toMatch(/@media\s*\(min-width:\s*48rem\)[\s\S]*\.admin-mailing-analytics-kpis/s);
  });
});
