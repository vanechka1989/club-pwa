import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

describe("compact admin statistics and clients", () => {
  it("uses a compact KPI summary and focused statistic navigation", () => {
    expect(source).toContain('class="admin-stat-period-summary ui-card"');
    expect(source.match(/class="admin-stat-nav-row/g)?.length).toBe(5);
    expect(source).not.toContain("<small v-if=\"item.value\">Подробнее</small>");
    expect(styles).toContain(".admin-stat-period-summary");
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
    expect(source).toContain('class="admin-client-identity"');
    expect(source).toContain('class="admin-client-kpi-grid"');
    expect(source).toContain('class="admin-client-primary-actions"');
    expect(source.match(/class="admin-client-kpi"/g)?.length).toBe(4);
    expect(styles).toContain(".admin-client-list-row");
    expect(styles).toContain(".admin-client-kpi-grid");
    expect(styles).toContain(".admin-client-primary-actions");
    expect(styles).toMatch(/\.admin-task-screen \.admin-client-task-card\s*\{[^}]*grid-auto-rows:\s*max-content;/s);
    expect(styles).toMatch(/@media \(max-width: 359px\)[\s\S]*\.admin-client-kpi-grid/);
  });

  it("collapses secondary client information by default", () => {
    for (const label of ["Профиль", "Устройство", "IP входов", "Активность"]) {
      expect(source).toContain(`<summary>${label}`);
    }
    expect(styles).toContain(".admin-client-compact-section");
  });
});
