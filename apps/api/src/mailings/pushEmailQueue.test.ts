import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("push and email mailing queue", () => {
  const routeSource = readFileSync(resolve(__dirname, "../routes/mailings.ts"), "utf8");
  const source = `${routeSource}\n${readFileSync(resolve(__dirname, "./deliveryState.ts"), "utf8")}`;

  it("persists delivery retry state without weakening recipient uniqueness", () => {
    const schema = readFileSync(resolve(__dirname, "../db/schema.ts"), "utf8");
    const migrationPath = resolve(__dirname, "../../drizzle/0049_mailing_delivery_retries.sql");

    expect(schema).toContain('attemptCount: integer("attempt_count").notNull().default(0)');
    expect(schema).toContain('nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })');
    expect(schema).toContain('lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true })');
    expect(schema).toContain('index("admin_mailing_recipients_retry_idx")');
    expect(schema).toContain('uniqueIndex("admin_mailing_recipients_mailing_user_channel_idx")');
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) {
      return;
    }
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain('ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL');
    expect(migration).toContain('ADD COLUMN "next_attempt_at" timestamp with time zone');
    expect(migration).toContain('ADD COLUMN "last_attempt_at" timestamp with time zone');
    expect(migration).toContain('CREATE INDEX "admin_mailing_recipients_retry_idx"');
  });

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
    expect(deliverySource).toContain("await waitForEmailRateSlot(reservation.scheduledAt)");
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
    expect(source).toContain("attemptCount: adminMailingRecipients.attemptCount");
  });

  it("recovers stale claims and only selects due retry deliveries", () => {
    expect(source).toContain("getStaleMailingProcessingCutoff(now)");
    expect(source).toContain('eq(adminMailingRecipients.status, "processing")');
    expect(source).toContain("lt(adminMailingRecipients.updatedAt, staleProcessingCutoff)");
    expect(source).toContain("isNull(adminMailingRecipients.nextAttemptAt)");
    expect(source).toContain("lte(adminMailingRecipients.nextAttemptAt, now)");
    expect(source).toMatch(/attemptCount:\s*sql`\$\{adminMailingRecipients\.attemptCount\} \+ 1`/);
    expect(source).toContain("lastAttemptAt: now");
    expect(source).toContain("getMailingRetryDecision(claimedRecipient.attemptCount, error, new Date())");
  });

  it("derives exact aggregate counters and completion from recipient rows", () => {
    expect(source).toContain("recalculateMailingDeliveryState");
    expect(source).toContain("FILTER (WHERE");
    expect(source).toContain("pendingCount");
    expect(source).toContain("processingCount");
    expect(source).toMatch(/sentCount:\s*counts\.sentCount/);
    expect(source).toMatch(/failedCount:\s*counts\.failedCount/);
    expect(source).toMatch(/skippedCount:\s*counts\.skippedCount/);
    expect(source).not.toMatch(/sentCount:\s*sql`\$\{adminMailings\.sentCount\} \+/);
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
