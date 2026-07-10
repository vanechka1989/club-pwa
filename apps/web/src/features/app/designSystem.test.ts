import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Dark Soft Touch Premium design system", () => {
  const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf-8");

  it("defines the reference palette and shared component tokens", () => {
    expect(styles).toContain("Design system: Dark Soft Touch Premium 2026");
    expect(styles).toContain("--ds-bg: #0a0f17;");
    expect(styles).toContain("--ds-surface: #182232;");
    expect(styles).toContain("--ds-primary: #6c4dff;");
    expect(styles).toContain("--ds-blue: #4f8cff;");
    expect(styles).toContain("--ds-radius-card: 20px;");
    expect(styles).toContain("--ds-control-height: 48px;");
  });

  it("defines the reference layout for admin navigation, KPI cards and mobile safe areas", () => {
    expect(styles).toContain(".admin-tabs.ds-navigation-grid");
    expect(styles).toContain(".admin-stat-kpis.ds-kpi-grid");
    expect(styles).toContain("padding-bottom: calc(6.4rem + var(--club-safe-bottom));");
    expect(styles).toContain("@media (max-width: 360px)");
    expect(styles).toContain("@media (min-width: 1024px)");
  });

  it("normalizes routed support and lesson task screens after the redesign", () => {
    expect(styles).toContain(".learning-task-screen .lesson-preview-modal-edit");
    expect(styles).toContain(".learning-task-screen .lesson-editor-form .admin-field");
    expect(styles).toContain(".learning-task-screen .lesson-kind-buttons");
    expect(styles).toContain(".support-task-screen .support-task-customer-head");
    expect(styles).toContain(".support-task-screen .support-reply-actions");
    expect(styles).toContain("overflow-x: hidden");
  });
});
