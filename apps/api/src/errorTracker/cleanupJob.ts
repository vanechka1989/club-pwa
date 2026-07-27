const cleanupIntervalMs = 24 * 60 * 60_000;

export function startErrorTrackerCleanupJob(prune: () => Promise<void> = async () => {
  const { prunePersistedErrors } = await import("./postgresRepository");
  await prunePersistedErrors();
}) {
  const run = () => {
    void prune().catch(async (error) => {
      const { logger } = await import("../logger");
      logger.warn({ error }, "error tracker cleanup failed");
    });
  };
  run();
  const timer = setInterval(run, cleanupIntervalMs);
  timer.unref?.();
  return timer;
}
