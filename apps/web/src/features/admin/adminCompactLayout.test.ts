import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "@/test/appStyles";

const shellSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
const source = readFileSync(resolve(__dirname, "AdminClientsPanel.vue"), "utf8");
const styles = [readAppStyles("admin"), readFileSync(resolve(__dirname, "adminShell.css"), "utf8")].join("\n");

describe("compact admin statistics and clients", () => {
  it("uses a compact KPI summary and focused statistic navigation", () => {
    expect(shellSource).toContain('class="admin-stat-period-summary ui-card"');
    expect(shellSource.match(/class="admin-stat-nav-row/g)?.length).toBe(6);
    expect(shellSource).not.toContain("<small v-if=\"item.value\">Подробнее</small>");
    expect(styles).toContain(".admin-stat-period-summary");
    expect(styles).toMatch(/\.admin-statistics-panel \.admin-stat-nav-row,[^{]+\{[^}]*min-height:\s*72px;[^}]*height:\s*auto;/);
  });

  it("keeps search visible and moves secondary client filters into a disclosure", () => {
    expect(source).toContain('class="admin-client-searchbar"');
    expect(source).toContain('class="admin-client-filter-chips"');
    expect(source).toContain('class="admin-client-more-filters"');
    expect(source).toContain("Найдено: {{ filteredUsers.length }}");
  });

  it("offers compact source and UTM filters inside the client disclosure", () => {
    expect(source).toContain('class="admin-client-acquisition-filters"');
    expect(source).toContain('aria-label="Источник клиента"');
    expect(source).toContain("Без метки");
    expect(source).toContain('aria-label="Поле UTM"');
    expect(source).toContain('aria-label="Значение UTM"');
    expect(styles).toContain(".admin-client-acquisition-filters");
  });

  it("structures each client row instead of joining all metadata into one sentence", () => {
    expect(source).toContain('class="admin-client-overview"');
    expect(source).toContain("admin-client-list-row");
    expect(source).toContain('class="admin-client-list-avatar"');
    expect(source).toContain('class="admin-client-list-chevron"');
    expect(source).toContain('class="admin-list-item-main"');
    expect(source).toContain('class="admin-client-list-metrics"');
    expect(source).toContain('class="admin-list-item-progress"');
    expect(source).toContain('class="admin-client-list-name-line"');
    expect(source).toContain("getAdminClientContact(user)");
    expect(source).toContain("formatAdminClientLastLogin");
    expect(styles).toMatch(/\.admin-list-item\.admin-client-list-row\s*\{[^}]*min-height:\s*72px;/s);
    expect(styles).toContain(".admin-access-badge-open");
    expect(styles).toContain(".admin-access-badge-closed");
  });

  it("prioritizes contact, activity, and access state in client cards", () => {
    expect(source).toContain('class="admin-client-sort-note"');
    expect(source).toContain("Последний вход ↓");
    expect(source).toContain("admin-client-list-contact");
    expect(source).toContain("admin-client-list-metrics");
    expect(source).toContain("admin-client-last-visit");
    expect(source).toContain("admin-client-status-rail");
    expect(source).toContain("formatAdminClientLastLogin");
  });

  it("keeps activity-first client cards readable down to 320 px", () => {
    expect(styles).toMatch(/\.admin-list-item\.admin-client-list-row\s*\{[^}]*grid-template-columns:\s*4px 40px minmax\(0, 1fr\) minmax\(88px, auto\) 14px;/s);
    expect(styles).toContain(".admin-client-status-rail");
    expect(styles).toContain(".admin-client-last-visit");
    expect(styles).toContain(".admin-client-list-row-open");
    expect(styles).toContain(".admin-client-list-row-restricted");
    expect(styles).toContain(".admin-client-list-row-closed");
    expect(styles).toMatch(/@media \(max-width: 359px\)[\s\S]*\.admin-client-last-visit/);
    expect(styles).toMatch(/\.admin-list-item\.admin-client-list-row:hover\s*\{[^}]*var\(--accent\)/s);
    expect(styles).toMatch(/\.admin-list-item:focus-visible\s*\{[^}]*outline:[^}]*var\(--accent\)/s);
  });

  it("balances the separate client screen between a summary and access controls", () => {
    expect(source).toContain('class="admin-task-screen admin-client-task-screen"');
    expect(source).toContain('class="admin-client-workspace"');
    expect(source).toContain('class="admin-client-task-heading"');
    expect(source).toContain('class="admin-client-contact-card admin-detail ui-card"');
    expect(source).not.toContain('class="admin-client-identity admin-detail ui-card"');
    expect(source).toContain('class="admin-client-kpi-grid"');
    expect(source).toContain('class="admin-client-primary-actions"');
    expect(source.match(/class="admin-client-kpi"/g)?.length).toBe(4);
    expect(styles).toContain(".admin-client-list-row");
    expect(styles).toContain(".admin-client-kpi-grid");
    expect(styles).toContain(".admin-client-primary-actions");
    expect(source).not.toContain('admin-client-modal admin-client-task-card');
    expect(styles).toContain(".admin-client-workspace");
    expect(styles).toMatch(/@media \(max-width: 359px\)[\s\S]*\.admin-client-kpi-grid/);
    expect(source).toMatch(/\.admin-client-task-screen\s+:deep\(\.task-screen-header\)\s*\{[^}]*min-height:\s*0;[^}]*padding-block:\s*8px;/s);
    expect(source).toMatch(/\.admin-client-task-avatar\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px;/s);
  });

  it("renders client sections as compact navigation rows instead of disclosures", () => {
    expect(source).toContain('class="admin-client-contact-card admin-detail ui-card"');
    expect(source).toContain('class="admin-client-action-panel admin-detail ui-card"');
    expect(source).toContain('class="admin-client-section admin-client-compact-link admin-detail ui-card"');
    expect(source).not.toContain('details class="admin-client-section');
  });

  it("routes secondary client information through named buttons", () => {
    for (const label of ["Устройства", "IP входов", "Активность"]) {
      expect(source).toContain(`<strong>${label}</strong>`);
    }
    expect(source).not.toContain("<summary>Профиль");
    expect(source).toContain('open-client-section');
    expect(styles).toContain(".admin-client-compact-link");
  });
});
