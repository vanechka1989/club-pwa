import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
const styles = ["../../styles.css", "adminShell.css"]
  .map((path) => readFileSync(resolve(__dirname, path), "utf8"))
  .join("\n");

describe("compact admin statistics and clients", () => {
  it("uses a compact KPI summary and focused statistic navigation", () => {
    expect(source).toContain('class="admin-stat-period-summary ui-card"');
    expect(source.match(/class="admin-stat-nav-row/g)?.length).toBe(6);
    expect(source).not.toContain("<small v-if=\"item.value\">Подробнее</small>");
    expect(styles).toContain(".admin-stat-period-summary");
    expect(styles).toMatch(/\.admin-statistics-panel \.admin-stat-nav-row,[^{]+\{[^}]*min-height:\s*72px;[^}]*height:\s*auto;/);
  });

  it("keeps search visible and moves secondary client filters into a disclosure", () => {
    expect(source).toContain('class="admin-client-searchbar"');
    expect(source).toContain('class="admin-client-filter-chips"');
    expect(source).toContain('class="admin-client-more-filters"');
    expect(source).toContain("Найдено: {{ filteredUsers.length }}");
  });

  it("structures each client row instead of joining all metadata into one sentence", () => {
    expect(source).toContain('class="admin-client-overview"');
    expect(source).toContain("admin-client-list-row");
    expect(source).toContain('class="admin-client-list-avatar"');
    expect(source).toContain('class="admin-client-list-chevron"');
    expect(source).toContain('class="admin-list-item-main"');
    expect(source).toContain('class="admin-list-item-meta"');
    expect(source).toContain('class="admin-list-item-progress"');
    expect(source).toContain('class="admin-client-list-name-line"');
    expect(source).toContain("user.email");
    expect(source).toContain("Последний вход:");
    expect(styles).toMatch(/\.admin-list-item\.admin-client-list-row\s*\{[^}]*min-height:\s*64px;/s);
    expect(styles).toContain(".admin-access-badge-open");
    expect(styles).toContain(".admin-access-badge-closed");
  });

  it("balances the separate client screen between a summary and access controls", () => {
    expect(source).toContain('class="admin-task-screen admin-client-task-screen"');
    expect(source).toContain('class="admin-client-workspace"');
    expect(source).toContain('class="admin-client-identity admin-detail ui-card"');
    expect(source).toContain('class="admin-client-kpi-grid"');
    expect(source).toContain('class="admin-client-primary-actions"');
    expect(source.match(/class="admin-client-kpi"/g)?.length).toBe(4);
    expect(styles).toContain(".admin-client-list-row");
    expect(styles).toContain(".admin-client-kpi-grid");
    expect(styles).toContain(".admin-client-primary-actions");
    expect(source).not.toContain('admin-client-modal admin-client-task-card');
    expect(styles).toContain(".admin-client-workspace");
    expect(styles).toMatch(/@media \(max-width: 359px\)[\s\S]*\.admin-client-kpi-grid/);
  });

  it("renders client sections as sibling cards instead of nested windows", () => {
    expect(source).toContain('class="admin-client-identity admin-detail ui-card"');
    expect(source).toContain('class="admin-client-action-panel admin-detail ui-card"');
    expect(source).toContain('class="admin-client-section admin-client-compact-section admin-detail ui-card"');
  });

  it("collapses secondary client information by default", () => {
    for (const label of ["Устройства", "IP входов", "Активность"]) {
      expect(source).toContain(`<summary>${label}`);
    }
    expect(source).not.toContain("<summary>Профиль");
    expect(styles).toContain(".admin-client-compact-section");
  });
});
