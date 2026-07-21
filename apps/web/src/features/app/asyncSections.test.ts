import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "../../App.vue"), "utf8");

describe("authenticated section loading", () => {
  it("loads large authenticated sections as independent chunks", () => {
    expect(appSource).toContain('import { computed, defineAsyncComponent, nextTick');

    for (const [name, path] of [
      ["AdminSection", "@/features/admin/AdminSection.vue"],
      ["PaymentsSection", "@/features/billing/PaymentsSection.vue"],
      ["CommunitySection", "@/features/community/CommunitySection.vue"],
      ["LearningSection", "@/features/learning/LearningSection.vue"],
      ["ProfileSection", "@/features/profile/ProfileSection.vue"],
      ["SupportSection", "@/features/support/SupportSection.vue"]
    ]) {
      expect(appSource).toContain(`const ${name} = defineAsyncComponent(() => import(\"${path}\"));`);
      expect(appSource).not.toContain(`import ${name} from \"${path}\";`);
    }
  });

  it("keeps authentication eager so signed-out users render without an extra route chunk", () => {
    expect(appSource).toContain('import AuthSection from "@/features/auth/AuthSection.vue";');
  });
});
