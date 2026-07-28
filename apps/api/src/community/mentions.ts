import type { CommunityMention } from "@club/shared";

export type ValidatedMentionRange = Pick<CommunityMention, "userId" | "start" | "end">;

export function validateMentionRanges(
  body: string,
  candidates: readonly CommunityMention[]
): ValidatedMentionRange[] {
  const orderedCandidates = [...candidates].sort((left, right) => left.start - right.start);
  const validated: ValidatedMentionRange[] = [];

  for (const candidate of orderedCandidates) {
    if (
      !Number.isInteger(candidate.start) ||
      !Number.isInteger(candidate.end) ||
      candidate.start < 0 ||
      candidate.end <= candidate.start ||
      candidate.end > body.length
    ) {
      throw new RangeError("Mention range is outside the message body");
    }

    if (body.slice(candidate.start, candidate.end) !== `@${candidate.displayName}`) {
      throw new Error("Mention range does not match the selected participant");
    }

    const previous = validated.at(-1);
    if (previous && previous.end > candidate.start) {
      throw new RangeError("Mention ranges must not overlap");
    }

    validated.push({
      userId: candidate.userId,
      start: candidate.start,
      end: candidate.end
    });
  }

  return validated;
}
