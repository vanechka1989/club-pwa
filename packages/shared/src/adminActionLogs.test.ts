import { describe, expect, it } from "vitest";
import { adminActionLogsResponseSchema } from "./index";

describe("admin action log contracts", () => {
  it("serializes action logs with actor, target, metadata and timestamps", () => {
    const parsed = adminActionLogsResponseSchema.parse({
      admins: [
        {
          telegramId: "111",
          firstName: "Ivan",
          username: "ivan",
          photoUrl: null
        }
      ],
      logs: [
        {
          id: "log-1",
          action: "admin.access.updated",
          entityType: "user",
          entityId: "user-1",
          targetTelegramId: "222",
          summary: "Открыл доступ клиенту",
          metadata: {
            status: "active",
            expiresAt: "2026-07-30T23:59:59.000Z",
            durationDays: 30
          },
          actor: {
            telegramId: "111",
            firstName: "Ivan",
            username: "ivan",
            photoUrl: null
          },
          target: {
            telegramId: "222",
            firstName: "Анна",
            username: "anna",
            photoUrl: null
          },
          createdAt: "2026-06-30T01:00:00.000Z"
        }
      ]
    });

    expect(parsed.admins[0]?.telegramId).toBe("111");
    expect(parsed.logs[0]?.actor?.username).toBe("ivan");
    expect(parsed.logs[0]?.target?.firstName).toBe("Анна");
    expect(parsed.logs[0]?.metadata).toEqual({
      status: "active",
      expiresAt: "2026-07-30T23:59:59.000Z",
      durationDays: 30
    });
  });
});
