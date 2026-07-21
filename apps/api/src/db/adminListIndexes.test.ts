import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(__dirname, "schema.ts"), "utf8");

describe("admin list indexes", () => {
  it("indexes chronological client and payment queries used by admin dashboards", () => {
    expect(schema).toContain('index("users_created_at_idx").on(table.createdAt)');
    expect(schema).toContain('index("users_updated_at_idx").on(table.updatedAt)');
    expect(schema).toContain('index("auth_sessions_user_last_seen_idx").on(table.userId, table.lastSeenAt)');
    expect(schema).toContain('index("payment_orders_created_at_idx").on(table.createdAt)');
    expect(schema).toContain('index("payment_orders_status_created_at_idx").on(table.status, table.createdAt)');
    expect(schema).toContain('index("club_chat_messages_created_at_idx").on(table.createdAt)');
    expect(schema).toContain('index("club_polls_created_at_idx").on(table.createdAt)');
  });
});
