import { describe, expect, it } from "vitest";
import { getLessonProgressState, getModuleProgress, resolveLessonNeighbors } from "./learningPath";

describe("learning path", () => {
  it("derives lesson states and module completion", () => {
    expect(getLessonProgressState("a", new Set(["a"]), new Set())).toBe("in_progress");
    expect(getLessonProgressState("b", new Set(["b"]), new Set(["b"]))).toBe("completed");
    expect(getLessonProgressState("c", new Set(), new Set())).toBe("not_started");
    expect(getModuleProgress(["a", "b", "c"], new Set(["b"]))).toEqual({ completed: 1, total: 3, percent: 33 });
  });

  it("navigates across module boundaries", () => {
    const modules = [
      { id: "m1", lessons: [{ id: "a", moduleId: "m1" }, { id: "b", moduleId: "m1" }] },
      { id: "m2", lessons: [{ id: "c", moduleId: "m2" }] }
    ];
    expect(resolveLessonNeighbors(modules, "b")).toEqual({ previous: { id: "a", moduleId: "m1" }, next: { id: "c", moduleId: "m2" } });
    expect(resolveLessonNeighbors(modules, "a")?.previous).toBeNull();
    expect(resolveLessonNeighbors(modules, "c")?.next).toBeNull();
  });
});
