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

  it("shows mockups only to the club owner", () => {
    expect(getVisibleAdminPanels("owner").map((panel) => panel.id)).toContain("mockups");
    expect(getVisibleAdminPanels("admin").map((panel) => panel.id)).not.toContain("mockups");
  });

  it("shows storage settings only to the club owner", () => {
    expect(getVisibleAdminPanels("owner").map((panel) => panel.id)).toContain("storage");
    expect(getVisibleAdminPanels("admin").map((panel) => panel.id)).not.toContain("storage");
  });
});
