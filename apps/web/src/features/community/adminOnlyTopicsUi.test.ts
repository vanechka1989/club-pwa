import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(resolve(__dirname, "CommunitySection.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "community.css"), "utf8");
const client = readFileSync(resolve(__dirname, "../../api/client.ts"), "utf8");
const i18n = readFileSync(resolve(__dirname, "../app/i18n.ts"), "utf8");

describe("admin-only community topic UI", () => {
  it("offers a compact admin-only switch and sends its value", () => {
    expect(component).toContain("const newTopicAdminOnly = ref(false)");
    expect(component).toContain('v-model="newTopicAdminOnly"');
    expect(component).toContain("isAdminOnly: newTopicAdminOnly.value");
    expect(component).toContain("newTopicAdminOnly.value = false");
    expect(client).toContain("isAdminOnly?: boolean");
  });

  it("marks private topics in the list and room header", () => {
    expect(component).toContain('class="admin-only-topic-badge"');
    expect(component).toContain('t("communityAdminOnlyBadge")');
    expect(component).toContain('t("communityAdminOnlyRoom")');
    expect(i18n).toContain('communityAdminOnlyBadge: "Только админы"');
    expect(i18n).toContain('communityAdminOnlyBadge: "Admins only"');
  });

  it("keeps the visibility switch touch-friendly", () => {
    expect(styles).toMatch(/\.chat-topic-visibility-toggle\s*\{[^}]*min-height:\s*44px;/s);
  });
});
