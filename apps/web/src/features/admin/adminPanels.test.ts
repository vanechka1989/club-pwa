import { describe, expect, it } from "vitest";
import { getAdminPanelForTaskPath, getVisibleAdminPanels } from "./adminPanels";

describe("admin panels", () => {
  it("shows statistics to owners and administrators with the statistics permission", () => {
    expect(getVisibleAdminPanels("owner").map((panel) => panel.id)).toContain("statistics");
    expect(getVisibleAdminPanels("admin", ["statistics"]).map((panel) => panel.id)).toContain("statistics");
  });

  it("fails closed while permissions are missing or empty", () => {
    expect(getVisibleAdminPanels("admin")).toEqual([]);
    expect(getVisibleAdminPanels("admin", [])).toEqual([]);
  });

  it("does not show the duplicated overview panel", () => {
    expect(getVisibleAdminPanels("owner").map((panel) => panel.id)).not.toContain("overview");
    expect(getVisibleAdminPanels("admin", []).map((panel) => panel.id)).not.toContain("overview");
  });

  it("does not show obsolete mockups panel", () => {
    expect(getVisibleAdminPanels("owner").map((panel) => panel.id)).not.toContain("mockups");
    expect(getVisibleAdminPanels("admin", []).map((panel) => panel.id)).not.toContain("mockups");
  });

  it("does not show obsolete content panel", () => {
    expect(getVisibleAdminPanels("owner").map((panel) => panel.id)).not.toContain("materials");
    expect(getVisibleAdminPanels("admin", ["materials"]).map((panel) => panel.id)).not.toContain("materials");
  });

  it("allows storage settings for owners or admins with storage permission", () => {
    expect(getVisibleAdminPanels("owner").map((panel) => panel.id)).toContain("storage");
    expect(getVisibleAdminPanels("admin", ["storage"]).map((panel) => panel.id)).toContain("storage");
    expect(getVisibleAdminPanels("admin", ["users"]).map((panel) => panel.id)).not.toContain("storage");
  });

  it("shows server logs only to the owner/developer", () => {
    expect(getVisibleAdminPanels("owner").map((panel) => panel.id)).toContain("server-logs");
    expect(getVisibleAdminPanels("admin", ["admins"]).map((panel) => panel.id)).not.toContain("server-logs");
  });

  it("limits admin panels by granted permissions", () => {
    expect(getVisibleAdminPanels("admin", ["users", "mailings"]).map((panel) => panel.id)).toEqual(["users", "mailings"]);
  });

  it("maps direct admin task links to the permission-protected panel", () => {
    expect(getAdminPanelForTaskPath("/admin/mailings/new")).toBe("mailings");
    expect(getAdminPanelForTaskPath("/admin/clients/user-1")).toBe("users");
    expect(getAdminPanelForTaskPath("/admin/storage/settings")).toBe("storage");
    expect(getAdminPanelForTaskPath("/admin/admins/user-1/access")).toBe("admins");
    expect(getAdminPanelForTaskPath("/admin/owner/transfer")).toBe("owner-only");
    expect(getAdminPanelForTaskPath("/admin/releases")).toBe("developer-only");
    expect(getAdminPanelForTaskPath("/admin/statistics/payments/paid")).toBe("statistics");
    expect(getAdminPanelForTaskPath("/admin")).toBeNull();
  });
});
