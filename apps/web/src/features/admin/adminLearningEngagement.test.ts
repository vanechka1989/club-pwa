import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(resolve(__dirname, "AdminLearningEngagement.vue"), "utf8");
const section = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

describe("admin learning engagement dashboard", () => {
  it("shows card metrics and a member drilldown inside analytics", () => {
    expect(component).toContain("Уникальные зрители");
    expect(component).toContain("Быстрые выходы");
    expect(component).toContain("Среднее время");
    expect(component).toContain("loadUsers(card)");
    expect(component).toContain("К карточкам");
    expect(section).toContain("<AdminLearningEngagement");
  });

  it("has designed loading, empty and error states", () => {
    expect(component).toContain("Загружаем просмотры");
    expect(component).toContain("Данные появятся после новых просмотров");
    expect(component).toContain("Не удалось загрузить статистику");
  });

  it("uses responsive grids without horizontal overflow", () => {
    expect(styles).toMatch(/\.admin-learning-engagement-kpis\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
    expect(styles).toMatch(/\.admin-learning-engagement-card\s*\{[^}]*min-width:\s*0/s);
  });
});
