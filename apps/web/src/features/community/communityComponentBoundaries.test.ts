import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(name: string) {
  const path = resolve(__dirname, name);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

describe("community component boundaries", () => {
  it("keeps API orchestration in the section and renders through presentational boundaries", () => {
    const sectionSource = read("CommunitySection.vue");
    const messageSource = read("ChatMessage.vue");
    const topicListSource = read("ChatTopicList.vue");
    const composerSource = read("ChatComposer.vue");
    const viewModelSource = read("communityViewModel.ts");

    expect(sectionSource.length).toBeLessThan(45_000);
    expect(messageSource).not.toContain("@/api/client");
    expect(topicListSource).not.toContain("@/api/client");
    expect(sectionSource).toContain("<ChatTopicList");
    expect(sectionSource).toContain("<ChatRoom");
    for (const event of ["reply", "react", "open-actions", "jump-reply", "poll-vote", "poll-close"]) {
      expect(messageSource).toContain(event);
    }
    for (const event of ["send-text", "send-voice", "send-files", "create-poll", "draft-change"]) {
      expect(composerSource).toContain(event);
    }
    expect(viewModelSource).toContain("export type ChatMessageAction");
    expect(viewModelSource).toContain('{ type: "jump-reply"; messageId: string }');
  });
});
