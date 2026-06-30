import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminSectionSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf-8");
const previewsPath = resolve(__dirname, "../../../public/previews");

describe("admin mockups", () => {
  it("includes admin permissions redesign options in mockups", () => {
    expect(adminSectionSource).toContain('id: "admin-permissions-options"');
    expect(adminSectionSource).toContain("Админы: права и доступ");
    expect(adminSectionSource).toContain("/previews/admin-permissions-1.svg");
    expect(adminSectionSource).toContain("/previews/admin-permissions-2.svg");
    expect(adminSectionSource).toContain("/previews/admin-permissions-3.svg");
    expect(adminSectionSource).toContain("/previews/admin-permissions-4.svg");
  });

  it("ships the admin permissions preview assets", () => {
    for (const fileName of [
      "admin-permissions-1.svg",
      "admin-permissions-2.svg",
      "admin-permissions-3.svg",
      "admin-permissions-4.svg"
    ]) {
      const source = readFileSync(resolve(previewsPath, fileName), "utf-8");

      expect(existsSync(resolve(previewsPath, fileName))).toBe(true);
      expect(source).toContain("<svg");
      expect(source).toContain("Админы");
    }
  });
});
