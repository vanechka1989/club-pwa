import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "@/test/appStyles";

const source = readFileSync(resolve(process.cwd(), "src/features/profile/ProfileSection.vue"), "utf8");
const styles = readAppStyles("profile");

describe("compact profile display name", () => {
  it("uses one editable nickname and one membership summary", () => {
    expect(source).toContain("session.updateDisplayName");
    expect(source).toContain("displayNameChangedByUserAt");
    expect(source).toContain('class="profile-membership-row"');
    expect(source).toContain("Изменение доступно через администратора");
    expect(styles).toContain(".profile-name-sheet-backdrop");
  });
});
