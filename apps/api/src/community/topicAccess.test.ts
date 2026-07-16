import { describe, expect, it } from "vitest";
import { isTopicAccessibleForRole } from "./topicAccess";

describe("admin-only community topic access", () => {
  it("allows every community role to open a public topic", () => {
    expect(isTopicAccessibleForRole({ isAdminOnly: false }, "member")).toBe(true);
    expect(isTopicAccessibleForRole({ isAdminOnly: false }, "admin")).toBe(true);
    expect(isTopicAccessibleForRole({ isAdminOnly: false }, "owner")).toBe(true);
  });

  it("allows only community administrators to open an admin-only topic", () => {
    expect(isTopicAccessibleForRole({ isAdminOnly: true }, "member")).toBe(false);
    expect(isTopicAccessibleForRole({ isAdminOnly: true }, "admin")).toBe(true);
    expect(isTopicAccessibleForRole({ isAdminOnly: true }, "owner")).toBe(true);
  });
});
