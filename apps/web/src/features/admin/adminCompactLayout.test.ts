import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

describe("compact admin statistics and clients", () => {
  it("uses one compact KPI summary and collapsible statistic groups", () => {
    expect(source).toContain('class="admin-stat-summary ui-card"');
    expect(source.match(/class="admin-stat-disclosure/g)?.length).toBeGreaterThanOrEqual(4);
    expect(source).not.toContain("<small v-if=\"item.value\">Подробнее</small>");
    expect(styles).toContain(".admin-stat-summary");
  });

  it("keeps search visible and moves secondary client filters into a disclosure", () => {
    expect(source).toContain('class="admin-client-searchbar"');
    expect(source).toContain('class="admin-client-filter-chips"');
    expect(source).toContain('class="admin-client-more-filters"');
    expect(source).toContain("Найдено: {{ filteredUsers.length }}");
  });

  it("structures each client row instead of joining all metadata into one sentence", () => {
    expect(source).toContain('class="admin-list-item-main"');
    expect(source).toContain('class="admin-list-item-meta"');
    expect(source).toContain('class="admin-list-item-progress"');
  });

  it("collapses secondary client information by default", () => {
    for (const label of ["Профиль", "Устройство", "IP входов", "Активность"]) {
      expect(source).toContain(`<summary>${label}`);
    }
    expect(styles).toContain(".admin-client-compact-section");
  });
});
