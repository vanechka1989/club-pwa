import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(resolve(__dirname, "../routes/community.ts"), "utf8");
const schema = readFileSync(resolve(__dirname, "../db/schema.ts"), "utf8");

describe("admin-only community topic routes", () => {
  it("persists and serializes the visibility flag", () => {
    expect(schema).toContain('isAdminOnly: boolean("is_admin_only").notNull().default(false)');
    expect(route).toContain("isAdminOnly: z.boolean().default(false)");
    expect(route).toContain("isAdminOnly: topic.isAdminOnly");
    expect(route).toContain("isAdminOnly: body.data.isAdminOnly");
  });

  it("filters topic lists and direct topic operations for members", () => {
    expect(route).toContain("memberVisibleTopicCondition");
    expect(route).toContain("getAccessibleTopic");
    expect(route.match(/getAccessibleTopic\(c\.req\.param\("id"\), role\)/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(route).toContain("serializeChat(chat, role)");
  });

  it("protects poll voting, reactions and realtime events", () => {
    expect(route).toContain("isTopicAccessibleForRole(poll.message.topic, role)");
    expect(route).toContain("isTopicAccessibleForRole(messageTopic, role)");
    expect(route).toContain("getCommunityRoleByTelegramId");
    expect(route).toContain("canReceiveCommunityEvent(event, telegramId, previewRole)");
  });
});
