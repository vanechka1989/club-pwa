export function shouldRunBackgroundJobs(value = process.env.RUN_BACKGROUND_JOBS) {
  return value !== "false";
}

export async function startBackgroundJobs() {
  if (!shouldRunBackgroundJobs()) return false;

  const [
    { startExpiredPendingPaymentOrderCleanup },
    { startMailingDispatcher, stopMailingDispatcher },
    { startCommunityMediaCleanupJob },
    { startPaymentReconciliationJob },
    { startMembershipExpiryReminderJob },
    { startErrorTrackerCleanupJob }
  ] =
    await Promise.all([
      import("./payments/orderCleanupJob"),
      import("./routes/mailings"),
      import("./community/mediaCleanup"),
      import("./payments/paymentReconciliation"),
      import("./membership/expiryReminderJob"),
      import("./errorTracker/cleanupJob")
    ]);

  const orderCleanupTimer = startExpiredPendingPaymentOrderCleanup();
  startMailingDispatcher();
  const mediaCleanupTimer = startCommunityMediaCleanupJob();
  const paymentReconciliationTimer = startPaymentReconciliationJob();
  const membershipExpiryReminderTimer = startMembershipExpiryReminderJob();
  const errorTrackerCleanupTimer = startErrorTrackerCleanupJob();
  return () => {
    clearInterval(orderCleanupTimer);
    stopMailingDispatcher();
    clearInterval(mediaCleanupTimer);
    clearInterval(paymentReconciliationTimer);
    clearInterval(membershipExpiryReminderTimer);
    clearInterval(errorTrackerCleanupTimer);
  };
}
