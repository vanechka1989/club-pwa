import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readAppStyles } from "@/test/appStyles";

const poll = readFileSync(resolve(__dirname, "AdminPollStatistics.vue"), "utf8");
const detail = readFileSync(resolve(__dirname, "AdminStatisticsDetail.vue"), "utf8");
const styles = readAppStyles("admin");

describe("admin poll and learning statistics layout", () => {
  it("renders every poll collapsed by default with author and timing metadata", () => {
    expect(poll).toContain('<details v-for="poll in stats.polls"');
    expect(poll).not.toContain('<details v-for="poll in stats.polls" open');
    expect(poll).toContain("pollAuthorLabel(poll.author)");
    expect(poll).toContain("poll.startedAt");
    expect(poll).toContain("poll.endedAt");
    expect(styles).toContain(".admin-poll-disclosure");
  });

  it("promotes the popular learning material into a readable block", () => {
    expect(detail).toContain('class="admin-stat-popular-material"');
    expect(styles).toContain(".admin-stat-popular-material");
    expect(styles).toContain("font-size: 14px");
  });

  it("uses one readable typography system for community and learning analytics", () => {
    expect(detail).toContain('class="admin-stat-hot-topic-card ui-card"');
    expect(detail).toContain('class="admin-stat-community-ranking"');
    expect(detail).toContain('class="admin-stat-content-kinds"');
    expect(styles).toContain(".admin-stat-hot-topic-card");
    expect(styles).toContain(".admin-stat-community-ranking");
    expect(styles).toContain(".admin-stat-content-kinds");
  });
});
