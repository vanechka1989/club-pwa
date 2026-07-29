export function shouldRunBackgroundJobs(value = process.env.RUN_BACKGROUND_JOBS) {
  return value !== "false";
}

export async function startBackgroundJobs() {
  if (!shouldRunBackgroundJobs()) return false;

  const [
    { startExpiredPendingPaymentOrderCleanup },
    { startMailingDispatcher, stopMailingDispatcher },
    { startCommunityObjectDeletionCleanupJob },
    { startCommunityMediaProcessorJob },
    { startCommunityUploadExpiryCleanupJob },
    { startCommunityDocumentScannerJob },
    { startCommunityNotificationOutboxJob },
    { startPaymentReconciliationJob },
    { startMembershipExpiryReminderJob },
    { startErrorTrackerCleanupJob }
  ] =
    await Promise.all([
      import("./payments/orderCleanupJob"),
      import("./routes/mailings"),
      import("./community/objectDeletionLedger"),
      import("./community/mediaProcessor"),
      import("./community/uploadSessions"),
      import("./community/documentScanner"),
      import("./notifications/communityOutbox"),
      import("./payments/paymentReconciliation"),
      import("./membership/expiryReminderJob"),
      import("./errorTracker/cleanupJob")
    ]);

  const orderCleanupTimer = startExpiredPendingPaymentOrderCleanup();
  startMailingDispatcher();
  const communityObjectDeletionJob = startCommunityObjectDeletionCleanupJob();
  const communityMediaProcessorJob = startCommunityMediaProcessorJob();
  const communityUploadExpiryCleanupJob = startCommunityUploadExpiryCleanupJob();
  const communityDocumentScannerJob = startCommunityDocumentScannerJob();
  const communityNotificationOutboxJob = startCommunityNotificationOutboxJob();
  const paymentReconciliationTimer = startPaymentReconciliationJob();
  const membershipExpiryReminderTimer = startMembershipExpiryReminderJob();
  const errorTrackerCleanupTimer = startErrorTrackerCleanupJob();
  return async () => {
    clearInterval(orderCleanupTimer);
    stopMailingDispatcher();
    clearInterval(paymentReconciliationTimer);
    clearInterval(membershipExpiryReminderTimer);
    clearInterval(errorTrackerCleanupTimer);
    await communityMediaProcessorJob.stop();
    await communityUploadExpiryCleanupJob.stop();
    await communityDocumentScannerJob.stop();
    await communityNotificationOutboxJob.stop();
    await communityObjectDeletionJob.stop();
  };
}
