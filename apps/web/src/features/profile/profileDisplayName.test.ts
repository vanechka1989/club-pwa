import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/features/profile/ProfileSection.vue"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("compact profile display name", () => {
  it("uses one editable nickname and one membership summary", () => {
    expect(source).toContain("session.updateDisplayName");
    expect(source).toContain("displayNameChangedByUserAt");
    expect(source).toContain("profile-details-card-v2");
    expect(source).toContain("profile-actions-v2");
    expect(source).toContain("profile-access-current-status payment-provider-status");
    expect(source).toContain("payment-provider-status-enabled");
    expect(source).toContain("payment-provider-status-disabled");
    expect(source).toContain("Изменение через администратора");
    expect(styles).toContain(".profile-name-sheet-backdrop");
  });
});
