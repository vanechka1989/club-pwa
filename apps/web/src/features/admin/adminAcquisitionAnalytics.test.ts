import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin acquisition analytics", () => {
  it("keeps dashboard and link generator inside the PWA", () => {
    const source = readFileSync(resolve(__dirname, "AdminAcquisitionAnalytics.vue"), "utf8");
    expect(source).toContain("Рекламные ссылки");
    expect(source).toContain("От клика до оплаты");
    expect(source).toContain("Откуда пришли клиенты");
    expect(source).toContain("Метки и ссылки");
    expect(source).toContain("<TaskScreen");
    expect(source).not.toContain('target="_blank"');
  });

  it("keeps zero-value funnel percentages separate from labels", () => {
    const source = readFileSync(resolve(__dirname, "AdminAcquisitionAnalytics.vue"), "utf8");
    expect(source).toContain('class="acquisition-funnel-track"');
    expect(source).toContain('class="acquisition-funnel-fill"');
  });

  it("shows one clear source attribution without first and last touch comparison", () => {
    const source = readFileSync(resolve(__dirname, "AdminAcquisitionAnalytics.vue"), "utf8");
    expect(source).not.toContain('class="acquisition-model"');
    expect(source).not.toContain("sourceComparison");
    expect(source).not.toContain("Начали с источника");
    expect(source).not.toContain("Перед регистрацией");
    expect(source).not.toContain('attribution: "first"');
    expect(source).toContain('attribution: "last"');
    expect(source).toContain("dashboard?.sources");
    expect(source).toContain("Конверсия");
  });

  it("renders numeric values between every bar group and its date", () => {
    const source = readFileSync(resolve(__dirname, "AdminAcquisitionAnalytics.vue"), "utf8");
    const bars = source.indexOf('class="acquisition-chart-bars"');
    const values = source.indexOf('class="acquisition-chart-values"');
    const date = source.indexOf("{{ shortDate(point.date) }}");
    expect(bars).toBeGreaterThan(0);
    expect(values).toBeGreaterThan(bars);
    expect(date).toBeGreaterThan(values);
    expect(source).toContain("{{ point.visits }}");
    expect(source).toContain("{{ point.registrations }}");
    expect(source).toContain("{{ point.paidUsers }}");
  });

  it("opens a daily people drilldown from a chart day", () => {
    const source = readFileSync(resolve(__dirname, "AdminAcquisitionAnalytics.vue"), "utf8");
    expect(source).toContain('@click="openDay(point.date)"');
    expect(source).toContain("getAdminAcquisitionDay");
    expect(source).toContain('title="Посетители"');
    expect(source).toContain('title="Регистрации"');
    expect(source).toContain('title="Оплатили"');
    expect(source).toContain("emit('client'");
  });

  it("renders the acquisition dashboard only inside the analytics task screen", () => {
    const section = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    const analyticsStart = section.indexOf(`activePanel === 'statistics'`);
    const usersStart = section.indexOf(`activePanel === 'users'`);
    const analytics = section.slice(analyticsStart, usersStart);
    expect(analytics.indexOf("<AdminAcquisitionAnalytics")).toBeGreaterThan(analytics.indexOf("<TaskScreen"));
    expect(analytics).toContain(`v-if="activeStatisticsDetail === 'acquisition'"`);
  });

  it("shows one client source with UTM values and no attribution journey", () => {
    const card = readFileSync(resolve(__dirname, "AdminClientAcquisition.vue"), "utf8");
    const section = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    expect(card).toContain("Источник клиента");
    expect(card).toContain("utm_source");
    expect(card).toContain("utm_medium");
    expect(card).toContain("utm_campaign");
    expect(card).toContain("utm_content");
    expect(card).not.toContain("Первое касание");
    expect(card).not.toContain("Последнее касание");
    expect(card).not.toContain("История переходов");
    expect(card).not.toContain("Открыть аналитику кампании");
    expect(card).not.toContain("client-acquisition-milestones");
    expect(section).toContain("<AdminClientAcquisition");
    expect(section).not.toContain('@analytics="openSelectedUserAcquisitionAnalytics"');
  });

  it("names acquisition analytics as advertising links", () => {
    const section = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    expect(section).toContain("Рекламные ссылки");
    expect(section).toContain("UTM-метки и результаты");
    expect(section).not.toContain("Источники и путь до оплаты");
    expect(section).not.toContain("метки и кампании");
  });
});
