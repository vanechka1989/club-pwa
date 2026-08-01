import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(resolve(__dirname, "../routes/learning.ts"), "utf8");
const schemaSource = readFileSync(resolve(__dirname, "../db/schema.ts"), "utf8");
const migrationSource = readFileSync(resolve(__dirname, "../../drizzle/0064_learning_favorites.sql"), "utf8");

describe("learning favorites persistence", () => {
  it("stores one favorite per authenticated user and lesson", () => {
    expect(schemaSource).toContain('"user_learning_favorites"');
    expect(migrationSource).toContain('UNIQUE("user_id", "content_item_id")');
    expect(migrationSource).toContain('ON DELETE cascade');
  });

  it("exposes idempotent active-member routes without trusting a client user id", () => {
    expect(routeSource).toContain('.put("/items/:id/favorite", requireActiveMember');
    expect(routeSource).toContain('.delete("/items/:id/favorite", requireActiveMember');
    expect(routeSource).toContain("onConflictDoNothing");
    expect(routeSource).not.toMatch(/favorite[\s\S]{0,900}body\.data\.userId/);
  });

  it("returns favorite ids only for available published learning content", () => {
    expect(routeSource).toContain("favoriteItemIds");
    expect(routeSource).toContain("userLearningFavorites.userId, userId");
    expect(routeSource).toContain("moduleContentWhere");
  });
});
