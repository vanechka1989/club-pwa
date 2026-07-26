import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "AdminProjectSettingsPanel.vue"), "utf8");
const client = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf8");

describe("owner emergency email login code card", () => {
  it("calls the owner-only endpoint and never exposes the card to regular admins", () => {
    expect(client).toContain("generateOwnerEmailLoginCode");
    expect(client).toContain('"/admin/owner-email-login-code"');
    expect(source).toContain('v-if="props.isOwner" class="ops-card"');
    expect(source).toContain('v-model.trim="email"');
    expect(source).toContain('type="email"');
    expect(source).toContain("Аварийный вход по email");
    expect(source).toContain("Одноразовый код для клиента");
  });

  it("shows a one-time code with explicit copy and reset actions", () => {
    expect(source).toContain("generated.code");
    expect(source).toContain("Скопировать");
    expect(source).toContain("Другой код");
    expect(source).toContain("createCode");
    expect(source).toContain("copyCode");
    expect(source).toContain("generated = null");
  });

  it("keeps the result compact and readable on a phone", () => {
    expect(source).toMatch(/\.code-result\{[^}]*display:grid[^}]*gap:8px/s);
    expect(source).toMatch(/\.code-result strong\{[^}]*font-size:1\.8rem[^}]*letter-spacing:\.16em/s);
    expect(source).toMatch(/\.code-result>div\{[^}]*display:flex[^}]*flex-wrap:wrap/s);
  });
});
