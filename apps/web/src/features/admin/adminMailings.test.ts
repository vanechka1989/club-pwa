import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const adminPanelsSource = readFileSync(resolve(__dirname, "adminPanels.ts"), "utf-8");
const adminSectionSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf-8");
const clientSource = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf-8");

describe("admin mailings panel", () => {
  it("adds mailings next to clients in the admin tabs", () => {
    expect(adminPanelsSource).toContain('"users", label: "Клиенты"');
    expect(adminPanelsSource).toContain('"mailings", label: "Рассылки"');
    expect(adminPanelsSource.indexOf('"users"')).toBeLessThan(adminPanelsSource.indexOf('"mailings"'));
    expect(adminPanelsSource.indexOf('"mailings"')).toBeLessThan(adminPanelsSource.indexOf('"payments"'));
  });

  it("offers channel choices, filters, attachments, test send, and ETA", () => {
    expect(adminSectionSource).toContain("В бот");
    expect(adminSectionSource).toContain("В приложение");
    expect(adminSectionSource).toContain("Везде");
    expect(adminSectionSource).toContain("Статус доступа");
    expect(adminSectionSource).toContain("Тип доступа");
    expect(adminSectionSource).toContain("Бот заблокирован");
    expect(adminSectionSource).toContain("Тест себе");
    expect(adminSectionSource).toContain("Примерное время");
    expect(adminSectionSource).toContain("pauseAdminMailing");
    expect(adminSectionSource).toContain("stopAdminMailing");
  });

  it("has API client methods for previewing and controlling mailings", () => {
    expect(clientSource).toContain("previewAdminMailing");
    expect(clientSource).toContain("createAdminMailing");
    expect(clientSource).toContain("testAdminMailing");
    expect(clientSource).toContain("pauseAdminMailing");
    expect(clientSource).toContain("stopAdminMailing");
  });
});
