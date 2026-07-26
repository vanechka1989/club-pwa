import { describe, expect, it } from "vitest";
import { splitRouteCss } from "./routeCssSplitter.mjs";

const categories = [
  { name: "profile", classPatterns: [/^profile-/, /^avatar-/] },
  { name: "support", classPatterns: [/^support-/] }
];

describe("route CSS splitter", () => {
  it("moves a rule only when every selector belongs to the same route", () => {
    const result = splitRouteCss(
      [
        ".profile-card { color: red; }",
        ".profile-title, .profile-copy { color: blue; }",
        ".profile-card, .surface-card { border: 0; }",
        ".profile-card.support-card { padding: 1rem; }"
      ].join("\n"),
      categories
    );

    expect(result.counts).toEqual({ profile: 2, support: 0 });
    expect(result.routeCss.profile).toContain(".profile-card { color: red; }");
    expect(result.routeCss.profile).toContain(".profile-title, .profile-copy { color: blue; }");
    expect(result.globalCss).toContain(".profile-card, .surface-card { border: 0; }");
    expect(result.globalCss).toContain(".profile-card.support-card { padding: 1rem; }");
  });

  it("treats commas inside functional selectors as part of one selector", () => {
    const result = splitRouteCss(":is(.profile-card, .profile-panel) > .profile-title { color: red; }", categories);

    expect(result.counts.profile).toBe(1);
    expect(result.globalCss).not.toContain("profile-card");
    expect(result.routeCss.profile).toContain(":is(.profile-card, .profile-panel) > .profile-title");
  });

  it("preserves ancestor at-rules around extracted rules", () => {
    const result = splitRouteCss(
      "@media (max-width: 640px) { @supports (display: grid) { .support-grid { display: grid; } } .shared { display: block; } }",
      categories
    );

    expect(result.counts.support).toBe(1);
    expect(result.routeCss.support).toContain("@media (max-width: 640px)");
    expect(result.routeCss.support).toContain("@supports (display: grid)");
    expect(result.routeCss.support).toContain(".support-grid { display: grid; }");
    expect(result.globalCss).toContain(".shared { display: block; }");
    expect(result.globalCss).not.toContain("support-grid");
  });
});
