import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("mailing analytics admin endpoints", () => {
  it("exposes validated analytics and recipient drill-down routes", () => {
    const route = readFileSync(resolve(__dirname, "../routes/mailings.ts"), "utf8");
    const shared = readFileSync(resolve(__dirname, "../../../../packages/shared/src/index.ts"), "utf8");
    const client = readFileSync(resolve(__dirname, "../../../web/src/api/client.ts"), "utf8");

    expect(route).toContain('.get("/:id/analytics"');
    expect(route).toContain('.get("/:id/recipients"');
    expect(route).toContain("mailingAnalyticsRecipientQuerySchema");
    expect(route).toContain("analyticsEnabledAt: now");
    expect(shared).toContain("adminMailingAnalyticsSchema");
    expect(shared).toContain("adminMailingAnalyticsRecipientsResponseSchema");
    expect(client).toContain("getAdminMailingAnalytics");
    expect(client).toContain("getAdminMailingAnalyticsRecipients");
  });
});
