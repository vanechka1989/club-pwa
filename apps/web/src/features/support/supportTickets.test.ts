import type { SupportTicket } from "@club/shared";
import { describe, expect, it } from "vitest";
import { sortSupportTickets } from "./supportTickets";

function ticket(input: Partial<SupportTicket> & Pick<SupportTicket, "id" | "status" | "updatedAt">): SupportTicket {
  return {
    id: input.id,
    topic: "payment",
    topicTitle: "Оплата",
    customTopic: null,
    message: "",
    status: input.status,
    statusLabel: "",
    waitingSince: null,
    customer: {
      telegramId: input.customer?.telegramId ?? input.id,
      firstName: input.customer?.firstName ?? null,
      username: input.customer?.username ?? null,
      photoUrl: input.customer?.photoUrl ?? null
    },
    closedAt: input.closedAt ?? null,
    closedBy: input.closedBy ?? null,
    messages: [],
    unread: input.unread ?? false,
    createdAt: input.createdAt ?? input.updatedAt,
    updatedAt: input.updatedAt
  };
}

describe("support ticket ordering", () => {
  it("keeps closed tickets below active tickets even when closed tickets are newer", () => {
    const ordered = sortSupportTickets([
      ticket({ id: "closed-new", status: "closed", updatedAt: "2026-07-05T09:00:00.000Z" }),
      ticket({ id: "open-old", status: "open", updatedAt: "2026-07-05T08:00:00.000Z" }),
      ticket({ id: "needs-reply", status: "open", unread: true, updatedAt: "2026-07-05T07:00:00.000Z" }),
      ticket({ id: "answered", status: "answered", updatedAt: "2026-07-05T10:00:00.000Z" })
    ]);

    expect(ordered.map((item) => item.id)).toEqual(["needs-reply", "open-old", "answered", "closed-new"]);
  });
});
