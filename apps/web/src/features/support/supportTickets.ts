import type { SupportTicket } from "@club/shared";

function supportTicketPriority(ticket: SupportTicket) {
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
