import { describe, expect, it } from "vitest";
import { getMailingDeliveryChannels, normalizeMailingChannel } from "./channels";

describe("mailing channels", () => {
  it.each(["app", "bot", "all"])("normalizes legacy %s campaigns to push", (channel) => {
    expect(normalizeMailingChannel(channel)).toBe("push");
  });

  it("keeps current channels and expands the combined channel", () => {
    expect(normalizeMailingChannel("email")).toBe("email");
    expect(normalizeMailingChannel("push_email")).toBe("push_email");
    expect(getMailingDeliveryChannels("push_email")).toEqual(["push", "email"]);
  });
});
