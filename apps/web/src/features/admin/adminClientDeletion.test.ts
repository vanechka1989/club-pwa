import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const panelSource = readFileSync(resolve(__dirname, "AdminClientsPanel.vue"), "utf8");
const sectionSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
const apiSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf8");

describe("owner client deletion", () => {
  it("exposes a typed DELETE request", () => {
    expect(apiSource).toContain("export function deleteAdminClient(telegramId: string)");
    expect(apiSource).toContain("`/admin/stats/users/${encodeURIComponent(telegramId)}`");
    expect(apiSource).toContain('method: "DELETE"');
  });

  it("shows an accessible bright-red trash action only when deletion is allowed", () => {
    expect(panelSource).toContain("Trash2");
    expect(panelSource).toContain("canDeleteSelectedUser: boolean");
    expect(panelSource).toContain('<template v-if="canDeleteSelectedUser" #actions>');
    expect(panelSource).toContain('aria-label="Удалить клиента"');
    expect(panelSource).toContain("admin-client-delete-button");
    expect(panelSource).toMatch(/\.admin-client-delete-button\s*\{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;[^}]*background:\s*transparent;/s);
    expect(panelSource).toMatch(/\.admin-client-delete-button::before\s*\{[^}]*width:\s*36px;[^}]*height:\s*36px;[^}]*background:\s*#ff2d55;/s);
  });

  it("guards the action by real owner role and ordinary client role", () => {
    expect(sectionSource).toContain('const canDeleteSelectedUser = computed(() => isOwner.value && selectedUser.value?.role === "member")');
    expect(sectionSource).toContain("if (!canDeleteSelectedUser.value || !selectedUser.value)");
    expect(sectionSource).toContain("await appDialogs.confirm({");
    expect(sectionSource).toContain('confirmLabel: "Удалить навсегда"');
    expect(sectionSource).toContain("await deleteAdminClient(telegramId)");
    expect(sectionSource).toContain('setStatus("Клиент полностью удалён.")');
  });
});
