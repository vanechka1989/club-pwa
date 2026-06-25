import type { ClubUser } from "@club/shared";
import { describe, expect, it } from "vitest";
import { shouldShowAccessClosedAlert } from "./accessStatus";

const activeUser = {
  membershipStatus: "active"
} as ClubUser;

const inactiveUser = {
  membershipStatus: "inactive"
} as ClubUser;

describe("access status alerts", () => {
  it("shows an alert when active access is closed during the session", () => {
    expect(shouldShowAccessClosedAlert(activeUser, inactiveUser)).toBe(true);
  });

  it("does not show an alert on initial inactive load", () => {
    expect(shouldShowAccessClosedAlert(null, inactiveUser)).toBe(false);
  });

  it("does not show an alert when access remains active", () => {
    expect(shouldShowAccessClosedAlert(activeUser, activeUser)).toBe(false);
  });
});
