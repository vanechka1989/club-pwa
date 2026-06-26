import { describe, expect, it } from "vitest";
import { getVisibleAdminPanels } from "./adminPanels";

describe("admin panels", () => {
  it("shows mockups only to the club owner", () => {
    expect(getVisibleAdminPanels("owner").map((panel) => panel.id)).toContain("mockups");
    expect(getVisibleAdminPanels("admin").map((panel) => panel.id)).not.toContain("mockups");
  });
});
