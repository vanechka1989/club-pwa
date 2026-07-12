import { describe, expect, it } from "vitest";
import { resolvePollEndedAt, summarizePollStatistics } from "./pollStats";

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

  it("uses the actual close time before the planned close time", () => {
    const planned = new Date("2026-07-15T10:00:00.000Z");
    const actual = new Date("2026-07-14T08:30:00.000Z");
    expect(resolvePollEndedAt({ closesAt: planned, closedAt: actual })).toBe(actual.toISOString());
    expect(resolvePollEndedAt({ closesAt: planned, closedAt: null })).toBe(planned.toISOString());
    expect(resolvePollEndedAt({ closesAt: null, closedAt: null })).toBeNull();
  });
});
