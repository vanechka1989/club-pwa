export const sessionActivityRefreshMs = 5 * 60 * 1000;

export function shouldRefreshSessionActivity(lastSeenAt: Date, now = new Date()) {
  return now.getTime() - lastSeenAt.getTime() >= sessionActivityRefreshMs;
}
