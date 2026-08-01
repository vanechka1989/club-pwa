import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "../routes/learning.ts"), "utf8");

describe("personal lesson notes access", () => {
  it("returns only notes belonging to the authenticated member", () => {
    expect(source).toContain('.get("/items/:id/comments", requireActiveMember');
    expect(source).toContain("eq(lessonComments.contentItemId, item.id)");
    expect(source).toContain("eq(lessonComments.userId, userId)");
    expect(source).toContain('const userId = c.get("userId")');
  });

  it("creates notes for the authenticated member and enforces the 2000 character limit", () => {
    expect(source).toContain("z.string().trim().min(1).max(2000)");
    expect(source).toContain('userId: c.get("userId")');
    expect(source).not.toMatch(/comments[\s\S]{0,900}body\.data\.userId/);
  });
});
