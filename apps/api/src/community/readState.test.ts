import { describe, expect, it } from "vitest";
import { advanceReadPosition } from "./readState";

const positionAt = (messageId: string, createdAt: string) => ({
  messageId,
  createdAt: new Date(createdAt)
});

describe("advanceReadPosition", () => {
  it("keeps the current position when the candidate is older", () => {
    const current = positionAt("current", "2026-07-28T12:00:00.000Z");
    const candidate = positionAt("candidate", "2026-07-28T11:59:00.000Z");

    expect(advanceReadPosition(current, candidate)).toEqual(current);
  });

  it("advances to a newer candidate", () => {
    const current = positionAt("current", "2026-07-28T12:00:00.000Z");
    const candidate = positionAt("candidate", "2026-07-28T12:01:00.000Z");

    expect(advanceReadPosition(current, candidate)).toEqual(candidate);
  });

  it("uses the candidate when no read position exists", () => {
    const candidate = positionAt("candidate", "2026-07-28T12:01:00.000Z");

    expect(advanceReadPosition(null, candidate)).toEqual(candidate);
  });

  it("uses message id as a stable tie-breaker for equal timestamps", () => {
    const earlier = positionAt("00000000-0000-0000-0000-000000000001", "2026-07-28T12:00:00.000Z");
    const later = positionAt("00000000-0000-0000-0000-000000000002", "2026-07-28T12:00:00.000Z");

    expect(advanceReadPosition(earlier, later)).toBe(later);
    expect(advanceReadPosition(later, earlier)).toBe(later);
  });

  it("keeps the current position for an idempotent candidate", () => {
    const current = positionAt("00000000-0000-0000-0000-000000000001", "2026-07-28T12:00:00.000Z");
    const candidate = positionAt("00000000-0000-0000-0000-000000000001", "2026-07-28T12:00:00.000Z");

    expect(advanceReadPosition(current, candidate)).toBe(current);
  });
});
