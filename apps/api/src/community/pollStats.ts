export function summarizePollStatistics(
  polls: Array<{ id: string; closed: boolean; voterIds: string[]; votesCount: number }>,
  eligibleUsers: number
) {
  const participants = new Set(polls.flatMap((poll) => poll.voterIds));
  return {
    totalPolls: polls.length,
    activePolls: polls.filter((poll) => !poll.closed).length,
    closedPolls: polls.filter((poll) => poll.closed).length,
    uniqueParticipants: participants.size,
    totalVotes: polls.reduce((sum, poll) => sum + poll.votesCount, 0),
    participationPercent: eligibleUsers ? Math.round((participants.size / eligibleUsers) * 100) : 0
  };
}
