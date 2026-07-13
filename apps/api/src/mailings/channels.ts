import type { MailingChannel } from "@club/shared";

export type MailingDeliveryChannel = "push" | "email";

export function normalizeMailingChannel(channel: string): MailingChannel {
  if (channel === "email" || channel === "push_email") {
    return channel;
  }
  return "push";
}

export function getMailingDeliveryChannels(channel: string): MailingDeliveryChannel[] {
  const normalized = normalizeMailingChannel(channel);
  return normalized === "push_email" ? ["push", "email"] : [normalized];
}
