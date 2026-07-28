export function shouldRunBackgroundJobs(value = process.env.RUN_BACKGROUND_JOBS) {
  return value !== "false";
}

export async function startBackgroundJobs() {
  if (!shouldRunBackgroundJobs()) return false;

  const [
    { startExpiredPendingPaymentOrderCleanup },
    { startMailingDispatcher, stopMailingDispatcher },
    { startCommunityMediaCleanupJob },
    { startCommunityMediaProcessorJob },
    { startCommunityUploadExpiryCleanupJob },
    { startCommunityDocumentScannerJob },
    { startDeletedMessageCleanupJob },
    { startPaymentReconciliationJob },
    { startMembershipExpiryReminderJob },
    { startErrorTrackerCleanupJob }
  ] =
    await Promise.all([
      import("./payments/orderCleanupJob"),
      import("./routes/mailings"),
      import("./community/mediaCleanup"),
      import("./community/mediaProcessor"),
      import("./community/uploadSessions"),
      import("./community/documentScanner"),
      import("./community/deletedMessageCleanup"),
      import("./payments/paymentReconciliation"),
      import("./membership/expiryReminderJob"),
      import("./errorTracker/cleanupJob")
    ]);

  const orderCleanupTimer = startExpiredPendingPaymentOrderCleanup();
  startMailingDispatcher();
  const mediaCleanupTimer = startCommunityMediaCleanupJob();
  const communityMediaProcessorJob = startCommunityMediaProcessorJob();
  const communityUploadExpiryCleanupJob = startCommunityUploadExpiryCleanupJob();
  const communityDocumentScannerJob = startCommunityDocumentScannerJob();
  const deletedMessageCleanupJob = startDeletedMessageCleanupJob();
  const paymentReconciliationTimer = startPaymentReconciliationJob();
  const membershipExpiryReminderTimer = startMembershipExpiryReminderJob();
  const errorTrackerCleanupTimer = startErrorTrackerCleanupJob();
  return async () => {
    clearInterval(orderCleanupTimer);
    stopMailingDispatcher();
    clearInterval(mediaCleanupTimer);
    clearInterval(paymentReconciliationTimer);
    clearInterval(membershipExpiryReminderTimer);
    clearInterval(errorTrackerCleanupTimer);
    await communityMediaProcessorJob.stop();
    await communityUploadExpiryCleanupJob.stop();
    await communityDocumentScannerJob.stop();
    await deletedMessageCleanupJob.stop();
  };
}
