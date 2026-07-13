import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
const client = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

describe("owner emergency email login code card", () => {
  it("calls the owner-only endpoint and never exposes the card to regular admins", () => {
    expect(client).toContain("generateOwnerEmailLoginCode");
    expect(client).toContain('"/admin/owner-email-login-code"');
    expect(source).toContain('v-if="isOwner" class="admin-crm-block ui-card admin-owner-login-code-card"');
    expect(source).toContain('v-model="ownerLoginCodeEmail"');
    expect(source).toContain('type="email"');
  });

  it("shows a one-time code with explicit copy and reset actions", () => {
    expect(source).toContain("generatedEmailLoginCode.code");
    expect(source).toContain("Скопировать код");
    expect(source).toContain("Создать другой");
    expect(source).toContain("Генерируем…");
    expect(source).toContain("copyOwnerLoginCode");
    expect(source).toContain('panel !== "project-settings"');
    expect(source).toContain("ownerLoginCodeExpiryTimer");
    expect(source).toContain("ownerLoginCodeRequestGeneration");
    expect(source).toContain('activePanel.value !== "project-settings"');
  });

  it("keeps the result compact and readable on a phone", () => {
    expect(styles).toMatch(/\.admin-owner-login-code-result\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/s);
    expect(styles).toMatch(/\.admin-owner-login-code-value\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s);
    expect(styles).toMatch(/@media \(max-width: 420px\)[\s\S]*\.admin-owner-login-code-result\s*\{[^}]*grid-template-columns:\s*1fr;/s);
  });
});
