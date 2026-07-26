import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { routeCssCategories } from "./routeCssConfig.mjs";
import { splitRouteCss } from "./routeCssSplitter.mjs";

describe("global stylesheet route ownership", () => {
  it("contains no rule whose complete selector list belongs to one lazy route", () => {
    const stylesPath = resolve(process.cwd(), "src/styles.css");
    const result = splitRouteCss(readFileSync(stylesPath, "utf8"), routeCssCategories);

    expect(result.counts).toEqual({
      profile: 0,
      learning: 0,
      support: 0,
      billing: 0,
      admin: 0,
      notification: 0,
      community: 0
    });
  });
});
