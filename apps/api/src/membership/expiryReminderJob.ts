import type { ExpiryReminderChannel } from "./expiryReminderLedger";
import { buildExpiryReminderMessage, getDueExpiryReminderStages, type ExpiryReminderStage } from "./expiryReminderPlan";

export const membershipExpiryReminderIntervalMs = 60 * 60_000;

export type ExpiryReminderCandidate = {
  subscriptionId: string;
  userId: string;
  email: string | null;
  provider: string;
  expiresAt: Date;
};

export function isAccessExpectedToExpire(provider: string, recurrentStatus: "active" | "cancelled" | null) {
  if (provider !== "prodamus_recurrent" && provider !== "lava_recurrent") return true;
  return recurrentStatus !== "active";
}

type DeliveryInput = ExpiryReminderCandidate & {
  deliveryId: string;
  stage: ExpiryReminderStage;
  title: string;
  body: string;
  pwaHtml: string;
  emailText: string;
  emailHtml: string;
};

export type ExpiryReminderJobDependencies = {
  listCandidates(now: Date): Promise<ExpiryReminderCandidate[]>;
  isCurrentSubscription(candidate: ExpiryReminderCandidate, now: Date): Promise<boolean>;
  claimDelivery(input: {
    subscriptionId: string;
    userId: string;
    expiresAt: Date;
    stage: ExpiryReminderStage;
    channel: ExpiryReminderChannel;
    now: Date;
  }): Promise<{ id: string } | null>;
  completeDelivery(id: string, result: { status: "sent" } | { status: "failed"; error: string }, now: Date): Promise<void>;
  deliverPwa(input: DeliveryInput): Promise<void>;
  deliverPush(input: DeliveryInput): Promise<void>;
  deliverEmail(input: DeliveryInput & { email: string }): Promise<void>;
};

export type ExpiryReminderRunResult = {
  candidates: number;
  sent: number;
  failed: number;
  skipped: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Reminder delivery failed";
}

export function createMembershipExpiryReminderRunner(deps: ExpiryReminderJobDependencies) {
  return async (now = new Date()): Promise<ExpiryReminderRunResult> => {
    const candidates = await deps.listCandidates(now);
    const result: ExpiryReminderRunResult = { candidates: candidates.length, sent: 0, failed: 0, skipped: 0 };

    for (const candidate of candidates) {
      const [stage] = getDueExpiryReminderStages(candidate.expiresAt, now);
      if (!stage || !(await deps.isCurrentSubscription(candidate, now))) {
        result.skipped += 1;
        continue;
      }

      const message = buildExpiryReminderMessage(stage, candidate.expiresAt);
      const channels: ExpiryReminderChannel[] = candidate.email ? ["pwa", "push", "email"] : ["pwa", "push"];

      for (const channel of channels) {
        const delivery = await deps.claimDelivery({
          subscriptionId: candidate.subscriptionId,
          userId: candidate.userId,
          expiresAt: candidate.expiresAt,
          stage,
          channel,
          now
        });
        if (!delivery) {
          result.skipped += 1;
          continue;
        }

        const input = { ...candidate, ...message, deliveryId: delivery.id, stage };
        try {
          if (channel === "pwa") await deps.deliverPwa(input);
          else if (channel === "push") await deps.deliverPush(input);
          else if (candidate.email) await deps.deliverEmail({ ...input, email: candidate.email });
          await deps.completeDelivery(delivery.id, { status: "sent" }, now);
          result.sent += 1;
        } catch (error) {
          await deps.completeDelivery(delivery.id, { status: "failed", error: errorMessage(error) }, now);
          result.failed += 1;
        }
      }
    }

    return result;
  };
}

async function productionDependencies(): Promise<ExpiryReminderJobDependencies> {
  const [drizzle, client, schema, ledger, push, email] = await Promise.all([
    import("drizzle-orm"),
    import("../db/client"),
    import("../db/schema"),
    import("./expiryReminderLedger"),
    import("../push/webPush"),
    import("../auth/emailDelivery")
  ]);
  const { and, desc, eq, gte, isNotNull, lte } = drizzle;
  const { db } = client;
  const { subscriptions, users, appNotifications, userRecurrentSubscriptions } = schema;

  return {
    async listCandidates(now) {
      const latestExpiry = new Date(now.getTime() + 4 * 24 * 60 * 60_000);
      const rows = await db
        .select({
          subscriptionId: subscriptions.id,
          userId: subscriptions.userId,
          email: users.email,
          provider: subscriptions.provider,
          expiresAt: subscriptions.expiresAt
        })
        .from(subscriptions)
        .innerJoin(users, eq(users.id, subscriptions.userId))
        .where(
          and(
            eq(subscriptions.status, "active"),
            isNotNull(subscriptions.expiresAt),
            gte(subscriptions.expiresAt, now),
            lte(subscriptions.expiresAt, latestExpiry)
          )
        )
        .orderBy(subscriptions.expiresAt);
      return rows.filter((row): row is ExpiryReminderCandidate => row.expiresAt instanceof Date);
    },
    async isCurrentSubscription(candidate, now) {
      const current = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.userId, candidate.userId),
        orderBy: [desc(subscriptions.createdAt)]
      });
      const isExactActiveSubscription = Boolean(
        current &&
          current.id === candidate.subscriptionId &&
          current.status === "active" &&
          current.expiresAt &&
          current.expiresAt.getTime() === candidate.expiresAt.getTime() &&
          current.expiresAt > now
      );
      if (!isExactActiveSubscription) return false;
      if (candidate.provider !== "prodamus_recurrent" && candidate.provider !== "lava_recurrent") return true;
      const recurrent = await db.query.userRecurrentSubscriptions.findFirst({
        where: eq(userRecurrentSubscriptions.userId, candidate.userId),
        orderBy: [desc(userRecurrentSubscriptions.updatedAt)]
      });
      return isAccessExpectedToExpire(candidate.provider, recurrent?.status ?? null);
    },
    claimDelivery: ledger.claimExpiryReminderDelivery,
    completeDelivery: ledger.completeExpiryReminderDelivery,
    async deliverPwa(input) {
      const existing = await db.query.appNotifications.findFirst({
        where: and(eq(appNotifications.source, "membership_expiry"), eq(appNotifications.sourceId, input.deliveryId))
      });
      if (existing) return;
      await db.insert(appNotifications).values({
        userId: input.userId,
        kind: "system",
        title: input.title,
        body: input.body,
        bodyHtml: input.pwaHtml,
        source: "membership_expiry",
        sourceId: input.deliveryId
      });
    },
    async deliverPush(input) {
      await push.sendWebPushToUser(input.userId, { title: input.title, body: input.body, url: "/payments" });
    },
    async deliverEmail(input) {
      await email.sendEmail({
        to: input.email,
        subject: input.title,
        text: input.emailText,
        html: input.emailHtml,
        headers: { "X-Club-Delivery-ID": input.deliveryId },
        category: "transactional"
      });
    }
  };
}

export async function runMembershipExpiryReminders(now = new Date()) {
  return createMembershipExpiryReminderRunner(await productionDependencies())(now);
}

export function startMembershipExpiryReminderJob() {
  const run = () => {
    void runMembershipExpiryReminders().then(async (result) => {
      const { logger } = await import("../logger");
      if (result.sent || result.failed) logger.info(result, "membership expiry reminders processed");
    }).catch(async (error) => {
      const { logger } = await import("../logger");
      logger.warn({ error }, "membership expiry reminder job failed");
    });
  };
  run();
  return setInterval(run, membershipExpiryReminderIntervalMs);
}
