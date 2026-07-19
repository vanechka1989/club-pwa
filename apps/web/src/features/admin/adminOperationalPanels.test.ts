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
});
