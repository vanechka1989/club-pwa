import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readFeature = (name: string) => readFileSync(resolve(__dirname, `../${name}`), "utf8");
const appSource = readFileSync(resolve(__dirname, "../../App.vue"), "utf8");

describe("permission-aware application sections", () => {
  it("does not infer module management from the admin role alone", () => {
    const source = readFeature("learning/LearningSection.vue");
    expect(source).toContain('hasAdminCapability(session.user?.role, session.user?.adminPermissions, "materials")');
  });

  it("does not infer payment management from the admin role alone", () => {
    const source = readFeature("billing/PaymentsSection.vue");
    expect(source).toContain('hasAdminCapability(session.user?.role, session.user?.adminPermissions, "payments")');
  });

  it("does not infer chat moderation from the admin role alone", () => {
    const source = readFeature("community/CommunitySection.vue");
    expect(source).toContain('hasAdminCapability(session.user?.role, session.user?.adminPermissions, "community")');
  });

  it("does not infer support management from the admin role alone", () => {
    const source = readFeature("support/SupportSection.vue");
    expect(source).toContain('hasAdminCapability(session.user?.role, session.user?.adminPermissions, "support")');
  });

  it("does not poll support as an operator or expose an empty admin area without permissions", () => {
    expect(appSource).toContain('hasAdminCapability(session.user.realRole, session.user.adminPermissions, "support")');
    expect(appSource).toContain("getVisibleAdminPanels(session.user.realRole, session.user.adminPermissions).length === 0");
  });

  it("rejects direct links to admin tasks whose panel is not granted", () => {
    const source = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    expect(source).toContain("getAdminPanelForTaskPath(path)");
    expect(source).toContain("!panels.value.some((panel) => panel.id === requestedPanel)");
    expect(source).toContain('router.replace("/admin")');
    expect(source).toContain('requestedPanel === "owner-only" && !isOwner.value');
    expect(source).toContain('requestedPanel === "developer-only" && !canViewReleaseNotes.value');
    expect(source).toContain("resetAdminTaskState");
  });

  it("re-evaluates open routes and data when permissions change", () => {
    const adminSource = readFileSync(resolve(__dirname, "AdminSection.vue"), "utf8");
    expect(appSource).toContain("session.user?.adminPermissions.join");
    expect(adminSource).toContain("adminPermissionStateKey");
    expect(adminSource).toMatch(/watch\(\s*adminPermissionStateKey,[\s\S]*loadAll\(\)\.then\(syncAdminTaskRoute\)/);
  });

  it("rejects direct payment management links without the payments capability", () => {
    const source = readFeature("billing/PaymentsSection.vue");
    expect(source).toContain('router.replace("/payments")');
    expect(source).toContain('route.path === "/payments/provider" && !isOwner.value');
    expect(source).toContain("isPaymentPlanTask && !isAdmin.value");
    expect(source).toContain("[() => route.path, isAdmin, isOwner]");
  });
});
