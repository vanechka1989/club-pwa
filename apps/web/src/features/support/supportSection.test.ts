import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "SupportSection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");
const appSource = readFileSync(resolve(__dirname, "../../App.vue"), "utf8");

describe("support section", () => {
  it("has separate customer and admin support experiences", () => {
    expect(source).toContain("support-customer-form");
    expect(source).toContain("support-admin-board");
    expect(source).toContain("Другая причина");
    expect(source).toContain("Отправить ответ");
    expect(source).toContain("Время ожидания");
  });

  it("supports photo and video attachments without oversized buttons", () => {
    expect(source).toContain('accept="image/*,video/*"');
    expect(source).toContain("support-compact-button");
    expect(styles).toMatch(/\.support-compact-button\s*\{[^}]*min-height:\s*2\.45rem;/s);
  });

  it("shows an unread support badge in navigation", () => {
    expect(appSource).toContain("supportUnreadCount");
    expect(appSource).toContain("bottom-nav-badge");
    expect(styles).toMatch(/\.bottom-nav-badge\s*\{/);
  });
});
