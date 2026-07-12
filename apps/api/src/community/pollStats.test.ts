import { describe, expect, it } from "vitest";
import { summarizePollStatistics } from "./pollStats";

describe("poll statistics", () => {
  it("summarizes active, closed, participants, votes, and participation", () => {
    const result = summarizePollStatistics(
      [
        { id: "p1", closed: false, voterIds: ["u1", "u2"], votesCount: 2 },
        { id: "p2", closed: true, voterIds: ["u2"], votesCount: 2 }
      ],
      4
    );
    expect(result).toEqual({ totalPolls: 2, activePolls: 1, closedPolls: 1, uniqueParticipants: 2, totalVotes: 4, participationPercent: 50 });
  });
});
