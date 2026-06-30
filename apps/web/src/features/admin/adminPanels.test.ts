import { describe, expect, it } from "vitest";
import { getVisibleAdminPanels } from "./adminPanels";

describe("admin panels", () => {
  it("shows statistics to administrators and owners", () => {
    expect(getVisibleAdminPanels("owner").map((panel) => panel.id)).toContain("statistics");
    expect(getVisibleAdminPanels("admin").map((panel) => panel.id)).toContain("statistics");
  });

  it("does not show the duplicated overview panel", () => {
    expect(getVisibleAdminPanels("owner").map((panel) => panel.id)).not.toContain("overview");
    expect(getVisibleAdminPanels("admin").map((panel) => panel.id)).not.toContain("overview");
  });

  it("does not show obsolete mockups panel", () => {
    expect(getVisibleAdminPanels("owner").map((panel) => panel.id)).not.toContain("mockups");
    expect(getVisibleAdminPanels("admin").map((panel) => panel.id)).not.toContain("mockups");
  });

  it("allows storage settings for owners or admins with storage permission", () => {
    expect(getVisibleAdminPanels("owner").map((panel) => panel.id)).toContain("storage");
    expect(getVisibleAdminPanels("admin", ["storage"]).map((panel) => panel.id)).toContain("storage");
    expect(getVisibleAdminPanels("admin", ["users"]).map((panel) => panel.id)).not.toContain("storage");
  });

  it("limits admin panels by granted permissions", () => {
    expect(getVisibleAdminPanels("admin", ["users", "mailings"]).map((panel) => panel.id)).toEqual(["users", "mailings"]);
  });
});
