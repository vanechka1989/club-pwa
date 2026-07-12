import { describe, expect, it } from "vitest";
import { useStableMediaUrl } from "./useStableMediaUrl";

describe("useStableMediaUrl", () => {
  it("does not replace the playing URL when polling returns a renewed signature", () => {
    const media = useStableMediaUrl("https://cdn.test/voice.webm?signature=one");
    media.observe("https://cdn.test/voice.webm?signature=two");
    expect(media.currentUrl.value).toBe("https://cdn.test/voice.webm?signature=one");
  });

  it("switches to the newest signed URL only for an explicit retry", () => {
    const media = useStableMediaUrl("https://cdn.test/voice.webm?signature=one");
    media.observe("https://cdn.test/voice.webm?signature=two");
    media.refresh();
    expect(media.currentUrl.value).toBe("https://cdn.test/voice.webm?signature=two");
  });
});
