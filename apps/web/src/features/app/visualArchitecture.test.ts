import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const mainSections = [
  "../profile/ProfileSection.vue",
  "../learning/LearningSection.vue",
  "../community/CommunitySection.vue",
  "../billing/PaymentsSection.vue",
  "../support/SupportSection.vue",
  "../admin/AdminSection.vue"
] as const;

function source(relativePath: string) {
  return readFileSync(resolve(__dirname, relativePath), "utf8");
}

function occurrences(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

describe("visual architecture guardrails", () => {
  it("keeps legacy theme compatibility inside the shared header only", () => {
    const component = source("../ui/UiPageHeader.vue");

    expect(component).toContain('<header class="section-head ui-page-header">');
  });

  it("keeps admin header actions in the shared mobile header grid", () => {
    const styles = source("../../styles.css");

    expect(styles).toMatch(
      /body\.club-mobile-device \.admin-shell > \.ui-page-header > \.ui-page-header__actions\s*\{[\s\S]*display:\s*contents;/
    );
  });

  it.each(mainSections)("uses the shared page header in %s", (relativePath) => {
    const component = source(relativePath);

    expect(component).toContain("UiPageHeader");
    expect(component).toContain("<UiPageHeader");
    expect(component).not.toContain('class="section-head ui-page-header');
  });

  it("defines semantic typography roles in the shared foundation", () => {
    const foundation = source("../ui/foundation.css");

    for (const token of [
      "--app-type-section-title-size",
      "--app-type-card-title-size",
      "--app-type-body-size",
      "--app-type-label-size",
      "--app-type-meta-size",
      "--app-type-micro-size"
    ]) {
      expect(foundation).toContain(`${token}:`);
    }

    for (const role of [
      ".ui-section-title",
      ".ui-card-title",
      ".ui-body-text",
      ".ui-label-text",
      ".ui-meta-text",
      ".ui-micro-text"
    ]) {
      expect(foundation).toContain(role);
    }
  });

  it("keeps high-specificity overrides below the refactored baseline", () => {
    const legacyStyles = source("../../styles.css");
    const communityStyles = source("../community/community.css");
    const foundation = source("../ui/foundation.css");

    expect(occurrences(legacyStyles, /!important/g)).toBeLessThanOrEqual(28);
    expect(occurrences(communityStyles, /!important/g)).toBeLessThanOrEqual(4);
    expect(occurrences(foundation, /!important/g)).toBeLessThanOrEqual(27);
  });

  it("does not hard-code tiny typography in feature and legacy styles", () => {
    const tinyRawSize = /font-size:\s*(?:10|11|12)px\b/g;

    expect(occurrences(source("../../styles.css"), tinyRawSize)).toBe(0);
    expect(occurrences(source("../community/community.css"), tinyRawSize)).toBe(0);
  });
});
