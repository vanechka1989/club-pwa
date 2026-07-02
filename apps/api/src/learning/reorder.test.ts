import { describe, expect, it } from "vitest";
import { buildSortOrderUpdates, validateReorderIds } from "./reorder";

describe("learning reorder helpers", () => {
  it("builds dense sort updates from the submitted order", () => {
    expect(buildSortOrderUpdates(["module-b", "module-a"])).toEqual([
      { id: "module-b", sortOrder: 0 },
      { id: "module-a", sortOrder: 1 }
    ]);
  });

  it("accepts only the same ids as the existing list", () => {
    expect(validateReorderIds(["b", "a"], ["a", "b"])).toEqual({
      ok: true,
      updates: [
        { id: "b", sortOrder: 0 },
        { id: "a", sortOrder: 1 }
      ]
    });
  });

  it("rejects duplicate, missing, and foreign ids", () => {
    expect(validateReorderIds(["a", "a"], ["a", "b"]).ok).toBe(false);
    expect(validateReorderIds(["a"], ["a", "b"]).ok).toBe(false);
    expect(validateReorderIds(["a", "c"], ["a", "b"]).ok).toBe(false);
  });
});
