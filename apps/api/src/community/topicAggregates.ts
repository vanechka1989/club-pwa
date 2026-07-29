type TopicStateAggregate = {
  unreadCount: number;
  notificationMode: "all" | "mentions" | "off";
};

type TopicAggregateDependencies = {
  loadMessageCounts: (topicIds: string[]) => Promise<Array<{ topicId: string; value: number }>>;
  loadLatestReplies: (topicIds: string[], currentUserId: string) => Promise<Array<{
    topicId: string;
    createdAt: Date | null;
  }>>;
  loadTopicStates: (currentUserId: string, topicIds: string[]) => Promise<Map<string, TopicStateAggregate>>;
};

export async function loadCommunityTopicAggregates(
  topicIds: string[],
  currentUserId: string,
  dependencies: TopicAggregateDependencies
) {
  if (!topicIds.length) {
    return {
      countsByTopic: new Map<string, number>(),
      repliesByTopic: new Map<string, Date | null>(),
      topicStates: new Map<string, TopicStateAggregate>()
    };
  }

  const [messageCounts, latestReplies, topicStates] = await Promise.all([
    dependencies.loadMessageCounts(topicIds),
    dependencies.loadLatestReplies(topicIds, currentUserId),
    dependencies.loadTopicStates(currentUserId, topicIds)
  ]);

  return {
    countsByTopic: new Map(messageCounts.map((row) => [row.topicId, row.value])),
    repliesByTopic: new Map(latestReplies.map((row) => [row.topicId, row.createdAt])),
    topicStates
  };
}
