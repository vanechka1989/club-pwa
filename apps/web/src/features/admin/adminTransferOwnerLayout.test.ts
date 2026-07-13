import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

describe("compact transfer owner screen", () => {
  it("uses a dedicated content-sized form without the duplicate modal header", () => {
    const screen = source.slice(
      source.indexOf('<TaskScreen v-if="showTransferOwnerModal"'),
      source.indexOf("</TaskScreen>", source.indexOf('<TaskScreen v-if="showTransferOwnerModal"'))
    );

    expect(screen).toContain('class="admin-task-screen admin-transfer-owner-task-screen"');
    expect(screen).toContain('class="admin-transfer-owner-card ui-card"');
    expect(screen).toContain('class="admin-form admin-transfer-owner-form"');
    expect(screen).not.toContain("admin-client-modal-head");
    expect(screen).not.toContain("admin-client-modal");
  });

  it("keeps every form row at content height with touch-friendly controls", () => {
    expect(styles).toMatch(/\.admin-transfer-owner-card\s*\{[^}]*align-self:\s*start;[^}]*align-content:\s*start;/s);
    expect(styles).toMatch(/\.admin-transfer-owner-form\s*\{[^}]*grid-auto-rows:\s*max-content;[^}]*align-content:\s*start;[^}]*gap:\s*12px;/s);
    expect(styles).toMatch(/\.admin-transfer-owner-form \.text-input,[\s\S]*\.admin-transfer-owner-form \.primary-button\s*\{[^}]*min-height:\s*48px;/s);
  });
});
