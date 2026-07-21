import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin acquisition analytics", () => {
  it("keeps dashboard and link generator inside the PWA", () => {
    const source = readFileSync(resolve(__dirname, "AdminAcquisitionAnalytics.vue"), "utf8");
    expect(source).toContain("От клика до оплаты");
    expect(source).toContain("Первый источник");
    expect(source).toContain("Последний источник");
    expect(source).toContain("Метки и ссылки");
    expect(source).toContain("<TaskScreen");
    expect(source).not.toContain('target="_blank"');
  });

  it("renders the acquisition dashboard only inside the analytics task screen", () => {
    const section = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    const analyticsStart = section.indexOf(`activePanel === 'statistics'`);
    const usersStart = section.indexOf(`activePanel === 'users'`);
    const analytics = section.slice(analyticsStart, usersStart);
    expect(analytics.indexOf("<AdminAcquisitionAnalytics")).toBeGreaterThan(analytics.indexOf("<TaskScreen"));
    expect(analytics).toContain(`v-if="activeStatisticsDetail === 'acquisition'"`);
  });

  it("shows first touch, last touch and history in client 360", () => {
    const card = readFileSync(resolve(__dirname, "AdminClientAcquisition.vue"), "utf8");
    const section = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    expect(card).toContain("Первое касание");
    expect(card).toContain("Последнее касание");
    expect(card).toContain("История переходов");
    expect(section).toContain("<AdminClientAcquisition");
  });
});
