export const maxLearningEngagementSeconds = 24 * 60 * 60;
export const quickExitSeconds = 5;
export const engagedViewSeconds = 10;

export type EngagementCounters = {
  activeSeconds: number;
  videoSeconds: number;
  playbackPositionSeconds: number;
};

export type LearningEngagementSample = EngagementCounters & {
  sessionId: string;
  userId: string;
  telegramId: string;
  contentItemId: string;
  title: string;
  categoryTitle: string;
  openedAt: Date;
  lastActivityAt: Date;
  closedAt: Date | null;
  completed: boolean;
  displayName: string;
  email: string | null;
};

function boundedSeconds(value: number) {
  return Math.min(maxLearningEngagementSeconds, Math.max(0, Math.trunc(value)));
}

export function mergeEngagementCounters(previous: EngagementCounters, incoming: EngagementCounters): EngagementCounters {
  const activeSeconds = Math.max(boundedSeconds(previous.activeSeconds), boundedSeconds(incoming.activeSeconds));
  return {
    activeSeconds,
    videoSeconds: Math.min(activeSeconds, Math.max(boundedSeconds(previous.videoSeconds), boundedSeconds(incoming.videoSeconds))),
    playbackPositionSeconds: Math.max(
      boundedSeconds(previous.playbackPositionSeconds),
      boundedSeconds(incoming.playbackPositionSeconds)
    )
  };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle] ?? 0
    : Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

export function summarizeLearningEngagement(samples: LearningEngagementSample[]) {
  const uniqueViewers = new Set(samples.map((sample) => sample.userId)).size;
  const quickExits = samples.filter((sample) => sample.activeSeconds < quickExitSeconds).length;
  const grouped = new Map<string, LearningEngagementSample[]>();
  for (const sample of samples) {
    const current = grouped.get(sample.contentItemId) ?? [];
    current.push(sample);
    grouped.set(sample.contentItemId, current);
  }

  const cards = [...grouped.values()].map((rows) => {
    const first = rows[0]!;
    const activeSeconds = rows.map((row) => row.activeSeconds);
    const cardQuickExits = rows.filter((row) => row.activeSeconds < quickExitSeconds).length;
    return {
      contentItemId: first.contentItemId,
      title: first.title,
      categoryTitle: first.categoryTitle,
      viewers: new Set(rows.map((row) => row.userId)).size,
      views: rows.length,
      engagedViews: rows.filter((row) => row.activeSeconds >= engagedViewSeconds).length,
      totalActiveSeconds: activeSeconds.reduce((sum, value) => sum + value, 0),
      averageActiveSeconds: Math.round(activeSeconds.reduce((sum, value) => sum + value, 0) / rows.length),
      medianActiveSeconds: median(activeSeconds),
      quickExits: cardQuickExits,
      quickExitPercent: percent(cardQuickExits, rows.length),
      videoSeconds: rows.reduce((sum, row) => sum + row.videoSeconds, 0),
      completedUsers: new Set(rows.filter((row) => row.completed).map((row) => row.userId)).size,
      lastViewedAt: new Date(Math.max(...rows.map((row) => row.lastActivityAt.getTime()))).toISOString()
    };
  }).sort((a, b) => b.totalActiveSeconds - a.totalActiveSeconds || b.views - a.views);

  return {
    summary: {
      uniqueViewers,
      views: samples.length,
      medianActiveSeconds: median(samples.map((sample) => sample.activeSeconds)),
      quickExitPercent: percent(quickExits, samples.length)
    },
    cards
  };
}

export function summarizeLearningEngagementUsers(samples: LearningEngagementSample[]) {
  const grouped = new Map<string, LearningEngagementSample[]>();
  for (const sample of samples) {
    const current = grouped.get(sample.userId) ?? [];
    current.push(sample);
    grouped.set(sample.userId, current);
  }

  return [...grouped.values()].map((rows) => {
    const first = rows[0]!;
    return {
      userId: first.userId,
      telegramId: first.telegramId,
      displayName: first.displayName,
      email: first.email,
      opens: rows.length,
      totalActiveSeconds: rows.reduce((sum, row) => sum + row.activeSeconds, 0),
      videoSeconds: rows.reduce((sum, row) => sum + row.videoSeconds, 0),
      playbackPositionSeconds: Math.max(...rows.map((row) => row.playbackPositionSeconds)),
      lastViewedAt: new Date(Math.max(...rows.map((row) => row.lastActivityAt.getTime()))).toISOString(),
      completed: rows.some((row) => row.completed)
    };
  }).sort((a, b) => b.totalActiveSeconds - a.totalActiveSeconds || b.lastViewedAt.localeCompare(a.lastViewedAt));
}
