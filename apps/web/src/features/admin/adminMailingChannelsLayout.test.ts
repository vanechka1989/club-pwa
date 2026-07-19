import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("mailing mobile layout", () => {
  const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

  it("centers the primary mailing action and keeps reset square", () => {
    expect(styles).toContain(".admin-mailings-panel > .admin-panel-head .admin-add-button");
    expect(styles).toContain(".admin-mailing-reset-button");
    expect(styles).toMatch(/\.admin-mailing-reset-button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/s);
  });

  it("lays channel cards and preview metrics out without overflow", () => {
    expect(styles).toContain(".admin-mailing-channels");
    expect(styles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
  });

  it("keeps HTML mode controls and source textarea usable on mobile", () => {
    expect(styles).toContain(".admin-mailing-editor-modes");
    expect(styles).toContain(".admin-mailing-html-source");
    expect(styles).toContain(".admin-mailing-message-preview");
    expect(styles).toMatch(/\.admin-mailing-editor-mode\s*\{[^}]*min-height:\s*44px;/s);
  });
});
