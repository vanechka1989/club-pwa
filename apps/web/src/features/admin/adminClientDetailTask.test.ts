import { cleanup, render, screen } from "@testing-library/vue";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { afterEach } from "vitest";
import AdminClientDetailTask from "./AdminClientDetailTask.vue";

const source = readFileSync(resolve("src/features/admin/AdminClientDetailTask.vue"), "utf8");

const baseProps = {
  section: "activity" as const,
  clientName: "Анна",
  user: { telegramId: "1", firstName: "Анна", lastOpenedItemTitle: null, lastOpenedAt: null } as any,
  detail: null,
  paymentOrders: [], lastPayment: null, devices: [], deviceText: "", loginIps: [], loginIpsLoading: false, loginIpsError: false,
  canManage: true, saving: false,
  paymentOrderDate: vi.fn(() => "01.08.2026"), paymentOrderStatusLabel: vi.fn((v) => v), formatDate: vi.fn((v) => v),
  formatCompactDate: vi.fn((v) => v), referralUserTitle: vi.fn(() => "Клиент"), referralRewardStatusLabel: vi.fn((v) => v),
  getDeviceTitle: vi.fn(() => "Телефон"), getDeviceScreen: vi.fn(() => "390×844"), isNewLoginIp: vi.fn(() => false)
};

describe("AdminClientDetailTask", () => {
  afterEach(cleanup);
  it("renders section content on a flat compact surface", () => {
    expect(source).toContain('class="admin-client-detail-page admin-client-detail-surface"');
    expect(source).not.toContain('class="admin-client-detail-page ui-card"');
    expect(source).toMatch(/\.admin-client-detail-page\s*\{[^}]*padding:\s*0/s);
  });

  it.each([
    ["activity", "Активность"], ["subscriptions", "Подписки"], ["payments", "Оплаты клиента"],
    ["referrals", "Рефералы"], ["moderation", "Ограничения и удаления"], ["devices", "Устройства"], ["login-ips", "IP входов"]
  ] as const)("opens %s as a dedicated task page", (section, title) => {
    render(AdminClientDetailTask, { props: { ...baseProps, section } });
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Назад" })).toBeTruthy();
  });
});
