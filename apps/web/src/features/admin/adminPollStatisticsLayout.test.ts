import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const poll = readFileSync(resolve(__dirname, "AdminPollStatistics.vue"), "utf8");
const detail = readFileSync(resolve(__dirname, "AdminStatisticsDetail.vue"), "utf8");
const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

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
});
