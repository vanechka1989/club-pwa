import { describe, expect, it } from "vitest";
import { resolveAdminPollStats } from "./adminStatsFallback";

describe("admin statistics fallback", () => {
  it("keeps the last valid poll statistics while an older API omits the field", () => {
    const current = { totalPolls: 2, activePolls: 1, closedPolls: 1, uniqueParticipants: 8, totalVotes: 12, participationPercent: 25, polls: [] };
    expect(resolveAdminPollStats(undefined, current)).toBe(current);
  });
});
