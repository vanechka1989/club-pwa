import { describe, expect, it } from "vitest";
import type { ClubMessage } from "@club/shared";
import { sortCommunityMessagesNewestFirst } from "./communityViewModel";

function message(id: string, createdAt: string) {
  return { id, createdAt, clientOperationId: null } as ClubMessage;
}

describe("community exact tuple ordering", () => {
  it("orders server messages by exact timestamp and UUID even inside one JS millisecond", () => {
    const lowerId = "00000000-0000-4000-8000-000000000101";
    const higherId = "00000000-0000-4000-8000-000000000102";
    const millisecondId = "00000000-0000-4000-8000-000000000103";
    const rows = [
      message(higherId, "2026-07-29T12:00:00.123456Z"),
      message(lowerId, "2026-07-29T12:00:00.123457Z"),
      message(lowerId, "2026-07-29T12:00:00.123456Z"),
      message(millisecondId, "2026-07-29T12:00:00.123Z")
    ];

    expect(sortCommunityMessagesNewestFirst(rows).map((row) => `${row.createdAt}|${row.id}`)).toEqual([
      `2026-07-29T12:00:00.123457Z|${lowerId}`,
      `2026-07-29T12:00:00.123456Z|${higherId}`,
      `2026-07-29T12:00:00.123456Z|${lowerId}`,
      `2026-07-29T12:00:00.123Z|${millisecondId}`
    ]);
  });
});
