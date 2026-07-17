import type { SupportTicket } from "@club/shared";

export type SupportTicketDisplayState =
  | "new"
  | "needs-reply"
  | "reply-sent"
  | "new-reply"
  | "reply-received"
  | "waiting-reply"
  | "closed";

export function getSupportTicketDisplayState(ticket: SupportTicket, isSupportAdmin: boolean): SupportTicketDisplayState {
  if (ticket.status === "closed") {
    return "closed";
  }

  if (isSupportAdmin) {
    if (ticket.status === "open") {
      return ticket.unread ? "new" : "needs-reply";
    }
    return "reply-sent";
  }

  if (ticket.status === "answered") {
    return ticket.unread ? "new-reply" : "reply-received";
  }

  return "waiting-reply";
}

export function getSupportTicketStats(tickets: SupportTicket[]) {
  return {
    newCount: tickets.filter((ticket) => ticket.status !== "closed" && ticket.unread).length,
    openCount: tickets.filter((ticket) => ticket.status !== "closed").length,
    closedCount: tickets.filter((ticket) => ticket.status === "closed").length
  };
}

function supportTicketPriority(ticket: SupportTicket) {
  if (ticket.status === "closed") {
    return 3;
  }
  if (ticket.unread) {
    return 0;
  }
  if (ticket.status === "open") {
    return 1;
  }
  if (ticket.status === "answered") {
    return 2;
  }
  return 3;
}

export function sortSupportTickets(tickets: SupportTicket[]) {
  return [...tickets].sort((left, right) => {
    const priorityDiff = supportTicketPriority(left) - supportTicketPriority(right);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}
