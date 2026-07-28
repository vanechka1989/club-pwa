import type { CommunityNotificationMode } from "@club/shared";

type CommunityNotificationInput = {
  mode: CommunityNotificationMode;
  mentioned: boolean;
  replied: boolean;
  senderUserId?: string;
  recipientUserId?: string;
};

export function shouldNotifyCommunityUser(input: CommunityNotificationInput) {
  if (
    input.senderUserId !== undefined &&
    input.recipientUserId !== undefined &&
    input.senderUserId === input.recipientUserId
  ) {
    return false;
  }

  if (input.mode === "off") {
    return false;
  }

  return input.mode === "all" || input.mentioned || input.replied;
}
