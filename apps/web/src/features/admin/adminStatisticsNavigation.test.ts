import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const section = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
const detail = () => readFileSync(resolve(__dirname, "AdminStatisticsDetail.vue"), "utf8");
const styles = ["../../styles.css", "adminShell.css"]
  .map((path) => readFileSync(resolve(__dirname, path), "utf8"))
  .join("\n");

describe("admin statistics navigation", () => {
  it("shows a two-metric period summary and six navigation rows", () => {
    expect(section).toContain('class="admin-stat-period-summary ui-card"');
    expect(section.match(/class="admin-stat-nav-row/g)).toHaveLength(6);
    for (const key of ["acquisition", "clients", "finance", "learning", "community", "polls"]) {
      expect(section).toMatch(new RegExp(`openStatisticsDetail\\(['\"]${key}['\"]\\)`));
    }
  });

  it("keeps the overview compact and moves acquisition into its task screen", () => {
    const overviewStart = section.indexOf(`activePanel === 'statistics'`);
    const usersStart = section.indexOf(`activePanel === 'users'`);
    const overview = section.slice(overviewStart, usersStart);
    const taskScreenPosition = overview.indexOf("<TaskScreen");
    const acquisitionPosition = overview.indexOf("<AdminAcquisitionAnalytics");

    expect(overview).toContain("UTM-метки и результаты");
    expect(taskScreenPosition).toBeGreaterThan(-1);
    expect(acquisitionPosition).toBeGreaterThan(taskScreenPosition);
    expect(overview).toContain(`activeStatisticsDetail === 'acquisition'`);
  });

  it("opens every statistic area in a task screen", () => {
    expect(section).toContain('class="admin-statistics-task-screen"');
    expect(section).toContain("<AdminStatisticsDetail");
    expect(detail()).toContain('type StatisticsDetail = "clients" | "finance" | "learning" | "community" | "polls"');
    for (const key of ["clients", "finance", "learning", "community", "polls"]) {
      expect(detail()).toMatch(new RegExp(`detail === ['\"]${key}['\"]`));
    }
  });

  it("distinguishes current-state sections from period sections", () => {
    expect(section).toContain("Состояние на сегодня");
    expect(section).toContain("за выбранный период");
    expect(detail()).toContain("Состояние на сегодня");
  });

  it("defines a compact row-based visual hierarchy", () => {
    expect(styles).toContain(".admin-stat-overview-nav");
    expect(styles).toContain(".admin-stat-nav-row");
    expect(styles).toContain(".admin-stat-period-summary");
    expect(styles).toContain(".admin-stat-alert-line");
  });

  it("locks overview and detail arrows into dedicated aligned columns", () => {
    expect(section.match(/class="admin-stat-nav-chevron"/g)).toHaveLength(6);
    expect(detail().match(/class="admin-stat-metric-chevron"/g)).toHaveLength(3);
    expect(styles).toContain("grid-template-columns: 44px minmax(0, 1fr) minmax(72px, auto) 24px");
    expect(styles).toContain(".admin-stat-drilldown::after { content: none;");
  });

  it("uses an equal compact four-column period selector", () => {
    expect(section).toContain('class="admin-stat-periods"');
    expect(styles).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(styles).toContain("body.club-mobile-device .admin-stat-periods");
  });

  it("keeps the selected period visible inside every analytics detail", () => {
    expect(section).toContain('<template #actions>');
    expect(section).toContain('class="admin-stat-task-period"');
    expect(section).toContain("statisticsPeriodShortLabel");
    expect(styles).toContain(".admin-stat-task-period");
  });

  it("shows visual dynamics inside client, finance, and community dashboards", () => {
    const source = detail();
    expect(source.match(/admin-stat-timeline ui-card/g)).toHaveLength(3);
    expect(source).toContain("Новые клиенты по дням");
    expect(source).toContain("Выручка по дням");
    expect(source).toContain("Сообщения по дням");
    expect(styles).toContain(".admin-stat-timeline-bars");
  });
});
