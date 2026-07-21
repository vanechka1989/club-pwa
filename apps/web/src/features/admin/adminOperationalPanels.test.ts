import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin operational panels", () => {
  it("keeps payment, integration and server screens out of the admin shell", () => {
    const shell = readFileSync(resolve(process.cwd(), "src/features/admin/AdminSection.vue"), "utf8");

    expect(shell).toContain('from "./AdminPaymentsPanel.vue"');
    expect(shell).toContain('from "./AdminProjectSettingsPanel.vue"');
    expect(shell).toContain('from "./AdminServerPanel.vue"');
    expect(shell).not.toContain('v-else-if="activePanel === \'payments\'"');
    expect(shell).not.toContain('v-else-if="activePanel === \'project-settings\'"');
  });

  it("keeps the payment refresh action stable on narrow screens", () => {
    const payments = readFileSync(resolve(process.cwd(), "src/features/admin/AdminPaymentsPanel.vue"), "utf8");

    expect(payments).toContain(".ops-head>div{min-width:0;flex:1}");
    expect(payments).toContain("white-space:nowrap");
    expect(payments).toContain("flex:none");
  });

  it("collapses project setting logs by default with accessible state", () => {
    const settings = readFileSync(resolve(process.cwd(), "src/features/admin/AdminProjectSettingsPanel.vue"), "utf8");

    expect(settings).toContain("const auditExpanded = ref(false)");
    expect(settings).toContain(':aria-expanded="auditExpanded"');
    expect(settings).toContain('aria-controls="project-settings-audit"');
    expect(settings).toContain('id="project-settings-audit"');
    expect(settings).toContain("История настроек · {{ audit.length }}");
  });
});
