import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "../../App.vue"), "utf8");
const adminSource = readFileSync(resolve(__dirname, "../admin/AdminSection.vue"), "utf8");

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

  it("loads isolated admin screens only when their panel opens", () => {
    expect(adminSource).toContain('import { computed, defineAsyncComponent, nextTick');
    for (const name of [
      "AdminStatisticsDetail",
      "AdminAcquisitionAnalytics",
      "AdminLearningEngagement",
      "AdminClientAcquisition",
      "AdminPaymentsPanel",
      "AdminProjectSettingsPanel",
      "AdminServerPanel"
    ]) {
      expect(adminSource).toMatch(new RegExp(`const ${name} = defineAsyncComponent\\(\\(\\) => import\\("\\./${name}\\.vue"\\)\\);`));
      expect(adminSource).not.toContain(`import ${name} from "./${name}.vue";`);
    }
  });

  it("keeps the release history outside the main admin chunk", () => {
    expect(adminSource).toContain('const AdminReleaseNotesTask = defineAsyncComponent(() => import("./AdminReleaseNotesTask.vue"));');
    expect(adminSource).not.toContain('getLocalizedReleaseNotes');
    expect(adminSource).not.toContain('v-for="note in localizedReleaseNotes"');
  });
});
