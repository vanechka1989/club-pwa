export function shouldRunBackgroundJobs(value = process.env.RUN_BACKGROUND_JOBS) {
  return value !== "false";
}

export async function startBackgroundJobs() {
  if (!shouldRunBackgroundJobs()) return false;

  const [
    { startExpiredPendingPaymentOrderCleanup },
    { startMailingDispatcher, stopMailingDispatcher },
    { startCommunityMediaCleanupJob }
  ] =
    await Promise.all([
      import("./payments/orderCleanupJob"),
      import("./routes/mailings"),
      import("./community/mediaCleanup")
    ]);

  const orderCleanupTimer = startExpiredPendingPaymentOrderCleanup();
  startMailingDispatcher();
  const mediaCleanupTimer = startCommunityMediaCleanupJob();
  return () => {
    clearInterval(orderCleanupTimer);
    stopMailingDispatcher();
    clearInterval(mediaCleanupTimer);
  };
}
