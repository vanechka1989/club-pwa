import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isTaskPath, sectionFromPath, sectionPath, taskRoutePaths } from "./taskNavigation";

describe("task navigation", () => {
  it("maps top-level and nested paths to their app sections", () => {
    expect(sectionFromPath("/profile")).toBe("profile");
    expect(sectionFromPath("/learning/lessons/lesson-1/edit")).toBe("learning");
    expect(sectionFromPath("/support/tickets/ticket-1")).toBe("support");
    expect(sectionFromPath("/admin/mailings/new")).toBe("admin");
    expect(sectionFromPath("/unknown")).toBe("profile");
  });

  it("provides stable top-level section paths", () => {
    expect(sectionPath("profile")).toBe("/profile");
    expect(sectionPath("payments")).toBe("/payments");
    expect(sectionPath("admin")).toBe("/admin");
  });

  it("marks every approved task route as a task path", () => {
    expect(taskRoutePaths.length).toBeGreaterThan(10);
    for (const path of taskRoutePaths) {
      const concretePath = path
        .replace(":ticketId", "ticket-1")
        .replace(":customerId", "customer-1")
        .replace(":segment", "all")
        .replace(":mailingId", "mailing-1")
        .replace(":folderId", "folder-1")
        .replace(":adminId", "admin-1")
        .replace(":planId", "plan-1")
        .replace(":moduleId", "module-1")
        .replace(":lessonId", "lesson-1");
      expect(isTaskPath(concretePath), path).toBe(true);
    }
  });

  it("does not treat section roots as task screens", () => {
    expect(isTaskPath("/profile")).toBe(false);
    expect(isTaskPath("/support")).toBe(false);
    expect(isTaskPath("/admin")).toBe(false);
  });

  it("can render a routed task as a full app surface without dialog semantics", () => {
    const source = readFileSync(resolve(__dirname, "TaskScreen.vue"), "utf8");
    expect(source).toContain("portal?: boolean");
    expect(source).toContain("task-screen-route-layer");
    expect(source).not.toContain('role="dialog"');
    expect(source).not.toContain('aria-modal="true"');
  });
});
