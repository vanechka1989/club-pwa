export function shouldRunBackgroundJobs(value = process.env.RUN_BACKGROUND_JOBS) {
  return value !== "false";
}

export async function startBackgroundJobs() {
  if (!shouldRunBackgroundJobs()) return false;

  const [{ startExpiredPendingPaymentOrderCleanup }, { startMailingDispatcher }, { startCommunityMediaCleanupJob }] =
    await Promise.all([
      import("./payments/orderCleanupJob"),
      import("./routes/mailings"),
      import("./community/mediaCleanup")
    ]);

  startExpiredPendingPaymentOrderCleanup();
  startMailingDispatcher();
  startCommunityMediaCleanupJob();
  return true;
}
