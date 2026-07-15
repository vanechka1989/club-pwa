import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("email spam reminder style", () => {
  it("uses the warning palette instead of the primary accent", () => {
    const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const rule = styles.match(/\.auth-form \.auth-spam-hint\s*\{([^}]*)\}/s)?.[1] ?? "";
    const iconRule = styles.match(/\.auth-spam-hint svg\s*\{([^}]*)\}/s)?.[1] ?? "";

    expect(rule).toContain("var(--warning)");
    expect(rule).not.toContain("var(--accent)");
    expect(iconRule).toContain("var(--warning)");
  });
});
