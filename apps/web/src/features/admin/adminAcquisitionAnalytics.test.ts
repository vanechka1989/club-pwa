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
    expect(source).toContain("Статистика переходов");
    expect(source).not.toContain("<strong>Воронка</strong>");
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
    expect(card).toContain('class="client-acquisition-source-value"');
    expect(card).not.toContain('class="client-acquisition-source"');
    expect(card).not.toContain("Первое касание");
    expect(card).not.toContain("Последнее касание");
    expect(card).not.toContain("История переходов");
    expect(card).not.toContain("Открыть аналитику кампании");
    expect(card).not.toContain("client-acquisition-milestones");
    expect(section).toContain("<AdminClientAcquisition");
    expect(section).not.toContain('@analytics="openSelectedUserAcquisitionAnalytics"');
  });

  it("keeps the client source on one line on narrow phones", () => {
    const card = readFileSync(resolve(__dirname, "AdminClientAcquisition.vue"), "utf8");
    expect(card).toMatch(/\.client-acquisition-source-value\{[^}]*white-space:nowrap[^}]*text-overflow:ellipsis[^}]*\}/);
    expect(card).not.toContain("max-width:38%");
    expect(card).not.toMatch(/\.client-acquisition-source-value\{[^}]*overflow-wrap:anywhere/);
  });

  it("places link management first and accepts any single UTM field", () => {
    const source = readFileSync(resolve(__dirname, "AdminAcquisitionAnalytics.vue"), "utf8");
    expect(source.indexOf('class="acquisition-links-entry')).toBeLessThan(source.indexOf('class="acquisition-kpis"'));
    expect(source).toContain("hasAnyUtm");
    expect(source).toContain("canCreateLink");
    expect(source).toContain(":disabled=\"saving || !canCreateLink\"");
    expect(source).not.toContain('v-model.trim="form.source" required');
    expect(source).not.toContain('v-model.trim="form.medium" required');
    expect(source).not.toContain('v-model.trim="form.campaign" required');
  });

  it("shows who created each advertising link", () => {
    const source = readFileSync(resolve(__dirname, "AdminAcquisitionAnalytics.vue"), "utf8");
    expect(source).toContain("link.createdBy?.label");
    expect(source).toContain("Создал");
    expect(source).toContain("formatLinkCreatedAt");
  });

  it("offers an optional short address and both link variants", () => {
    const source = readFileSync(resolve(__dirname, "AdminAcquisitionAnalytics.vue"), "utf8");
    const nginx = readFileSync(resolve(__dirname, "../../../nginx.conf"), "utf8");
    expect(source).toContain('v-model.trim="form.slug"');
    expect(source).toContain("Короткая ссылка");
    expect(source).toContain("Прямая ссылка");
    expect(source).toContain("link.shortUrl");
    expect(source).toContain("apiError.data?.error");
    expect(nginx).toContain("location /go/");
    expect(nginx).toContain("proxy_pass http://api:3000");
  });

  it("names acquisition analytics as advertising links", () => {
    const section = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    expect(section).toContain("Рекламные ссылки");
    expect(section).toContain("UTM-метки и результаты");
    expect(section).not.toContain("Источники и путь до оплаты");
    expect(section).not.toContain("метки и кампании");
  });
});
