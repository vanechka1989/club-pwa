import { describe, expect, it } from "vitest";
import { moveItemByDirection, moveItemToIndex } from "./sortOrder";

const items = [
  { id: "first", title: "First" },
  { id: "second", title: "Second" },
  { id: "third", title: "Third" }
];

describe("learning sort order helpers", () => {
  it("moves an item up or down without mutating the original list", () => {
    const movedDown = moveItemByDirection(items, "first", "down");
    const movedUp = moveItemByDirection(items, "third", "up");

    expect(movedDown.map((item) => item.id)).toEqual(["second", "first", "third"]);
    expect(movedUp.map((item) => item.id)).toEqual(["first", "third", "second"]);
    expect(items.map((item) => item.id)).toEqual(["first", "second", "third"]);
  });

  it("keeps the list unchanged when moving past the edge or an unknown item", () => {
    expect(moveItemByDirection(items, "first", "up")).toBe(items);
    expect(moveItemByDirection(items, "third", "down")).toBe(items);
    expect(moveItemByDirection(items, "missing", "down")).toBe(items);
  });

  it("moves a dragged item to the target index", () => {
    const moved = moveItemToIndex(items, "first", 2);

    expect(moved.map((item) => item.id)).toEqual(["second", "third", "first"]);
    expect(items.map((item) => item.id)).toEqual(["first", "second", "third"]);
  });
});
