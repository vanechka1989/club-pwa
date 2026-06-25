import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { paymentOrders } from "../db/schema";
import { logger } from "../logger";
import { getExpiredPendingPaymentOrderCutoff, pendingPaymentOrderCleanupIntervalMs } from "./orderCleanup";

export async function cleanupExpiredPendingPaymentOrders(now = new Date()) {
  const deletedOrders = await db
    .delete(paymentOrders)
    .where(and(eq(paymentOrders.status, "pending"), lt(paymentOrders.createdAt, getExpiredPendingPaymentOrderCutoff(now))))
    .returning({ id: paymentOrders.id });

  if (deletedOrders.length > 0) {
    logger.info({ count: deletedOrders.length }, "expired pending payment orders cleaned");
  }

  return deletedOrders.length;
}

export function startExpiredPendingPaymentOrderCleanup() {
  const runCleanup = () => {
    cleanupExpiredPendingPaymentOrders().catch((error) => {
      logger.warn({ error }, "expired pending payment order cleanup failed");
    });
  };

  runCleanup();
  return setInterval(runCleanup, pendingPaymentOrderCleanupIntervalMs);
}
