import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("push and email mailing queue", () => {
  const source = readFileSync(resolve(__dirname, "../routes/mailings.ts"), "utf8");

  it("builds independent push and email delivery rows", () => {
    expect(source).toContain('channel: "push"');
    expect(source).toContain('channel: "email"');
    expect(source).toContain("deliveryCount: preview.response.deliveryCount");
  });

  it("dispatches email with an unsubscribe header", () => {
    expect(source).toContain('recipient.channel === "email"');
    expect(source).toContain("await sendEmail({");
    expect(source).toContain('"List-Unsubscribe"');
    expect(source).toContain('category: isTest ? "mailing_test" : "mailing"');
    const deliverySource = readFileSync(resolve(__dirname, "../auth/emailDelivery.ts"), "utf8");
    expect(deliverySource).toContain("await waitForEmailRateSlot()");
    expect(deliverySource).toContain("reserveEmailQuota");
  });

  it("counts actual push and email recipients in preview", () => {
    expect(source).toContain("pushSubscriptionCount");
    expect(source).toContain("excludedMissingEmail");
    expect(source).not.toContain("excludedBotBlocked");
  });

  it("atomically claims each pending delivery before sending it", () => {
    const claimIndex = source.indexOf('status: "processing"');
    const sendIndex = source.indexOf("sendMailingToRecipient(mailing, recipient)");

    expect(claimIndex).toBeGreaterThan(-1);
    expect(sendIndex).toBeGreaterThan(claimIndex);
    expect(source).toContain('eq(adminMailingRecipients.status, "pending")');
    expect(source).toContain(".returning({ id: adminMailingRecipients.id })");
  });

  it("keeps aggregate counters and completion safe across parallel workers", () => {
    expect(source).toContain('inArray(adminMailingRecipients.status, ["pending", "processing"])');
    expect(source).toMatch(/sentCount:\s*sql`\$\{adminMailings\.sentCount\} \+ \$\{sent\}`/);
    expect(source).toMatch(/failedCount:\s*sql`\$\{adminMailings\.failedCount\} \+ \$\{failed\}`/);
    expect(source).toMatch(/skippedCount:\s*sql`\$\{adminMailings\.skippedCount\} \+ \$\{skipped\}`/);
  });

  it("repairs historical counters from unique recipient rows", () => {
    const migrationPath = resolve(__dirname, "../../drizzle/0041_mailing_delivery_idempotency.sql");
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) {
      return;
    }
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain('UPDATE "admin_mailings" AS mailing');
    expect(migration).toContain("FILTER (WHERE recipient.status = 'sent')");
    expect(migration).toContain("LIKE 'skipped_%'");
  });
});
