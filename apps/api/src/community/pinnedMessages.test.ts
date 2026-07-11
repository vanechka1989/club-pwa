import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("community pinned messages", () => {
  const schema = readFileSync(resolve(__dirname, "../db/schema.ts"), "utf8");
  const route = readFileSync(resolve(__dirname, "../routes/community.ts"), "utf8");
  const migration = readFileSync(resolve(__dirname, "../../drizzle/0035_pinned_chat_messages.sql"), "utf8");

  it("stores pin metadata and exposes it on community messages", () => {
    expect(schema).toContain('pinnedAt: timestamp("pinned_at"');
    expect(schema).toContain('pinnedByUserId: uuid("pinned_by_user_id")');
    expect(migration).toContain('ADD COLUMN "pinned_at"');
    expect(route).toContain("pinnedAt: message.pinnedAt?.toISOString() ?? null");
  });

  it("allows moderators to pin at most five visible user messages", () => {
    expect(route).toContain('.post("/messages/:id/pin"');
    expect(route).toContain('if (role === "member")');
    expect(route).toContain('(row?.value ?? 0) >= 5');
    expect(route).toContain('current.status !== "visible" || current.isSystem');
  });
});
