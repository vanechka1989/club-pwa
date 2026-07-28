import type { ModerationStatus, UserRole } from "@club/shared";
import { and, asc, desc, eq, gt, isNull, lt, not, or, sql } from "drizzle-orm";
import { clubChatMessages, clubChatTopics, clubMessageAttachments, users } from "../db/schema";
import { buildMessageAuthor } from "./messageMetadata";
import { isTopicAccessibleForRole } from "./topicAccess";

const maximumExcerptLength = 500;

export function buildSearchTokens(query: string) {
  return query.trim().toLocaleLowerCase("ru").split(/\s+/u).filter(Boolean);
}

export function normalizeSearchLimit(limit: number) {
  return Math.max(1, Math.min(50, Math.trunc(limit)));
}

function normalizeContextWindow(value: number) {
  return Math.max(0, Math.min(50, Math.trunc(value)));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeTextOnly(value: string) {
  return value.replaceAll("<", "‹").replaceAll(">", "›").replace(/\s+/gu, " ").trim();
}

export function buildSearchExcerpt(body: string, tokens: string[]) {
  const text = makeTextOnly(body);
  if (!text) return "";

  const normalizedTokens = tokens.map((token) => token.trim()).filter(Boolean);
  const firstMatch = normalizedTokens.reduce<number | null>((earliest, token) => {
    const index = text.toLocaleLowerCase("ru").indexOf(token.toLocaleLowerCase("ru"));
    if (index < 0) return earliest;
    return earliest === null ? index : Math.min(earliest, index);
  }, null);
  const fragmentLength = 430;
  const start = Math.max(0, Math.min(firstMatch === null ? 0 : firstMatch - 140, text.length - fragmentLength));
  const end = Math.min(text.length, start + fragmentLength);
  let excerpt = `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;

  for (const token of [...normalizedTokens].sort((left, right) => right.length - left.length)) {
    excerpt = excerpt.replace(new RegExp(escapeRegExp(token), "giu"), (match) => `【${match}】`);
  }

  return excerpt.slice(0, maximumExcerptLength);
}

export function isMessageDiscoverable(input: {
  role: UserRole;
  topic: { isAdminOnly: boolean; isPublished?: boolean };
  message: { status: ModerationStatus; deletedByUserAt: Date | null };
  hasQuarantinedAttachment: boolean;
}) {
  return (
    isTopicAccessibleForRole(input.topic, input.role) &&
    input.message.status === "visible" &&
    input.message.deletedByUserAt === null &&
    !input.hasQuarantinedAttachment
  );
}

const hasQuarantinedAttachment = sql<boolean>`exists (
  select 1
  from ${clubMessageAttachments}
  where ${clubMessageAttachments.messageId} = ${clubChatMessages.id}
    and (${clubMessageAttachments.scanStatus} <> 'ready' or ${clubMessageAttachments.deletedAt} is not null)
)`;

export function searchableMessageCondition() {
  return and(
    eq(clubChatMessages.status, "visible"),
    isNull(clubChatMessages.deletedByUserAt),
    not(hasQuarantinedAttachment)
  );
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export async function searchCommunityMessages(input: {
  query: string;
  topicId?: string;
  before?: string;
  limit: number;
  role: UserRole;
}) {
  const { db } = await import("../db/client");
  const tokens = buildSearchTokens(input.query);
  const normalizedQuery = tokens.join(" ");
  const limit = normalizeSearchLimit(input.limit);
  const authorPattern = `%${escapeLikePattern(normalizedQuery)}%`;
  const rows = await db
    .select({
      message: {
        id: clubChatMessages.id,
        topicId: clubChatMessages.topicId,
        body: clubChatMessages.body,
        status: clubChatMessages.status,
        deletedByUserAt: clubChatMessages.deletedByUserAt,
        createdAt: clubChatMessages.createdAt
      },
      topic: {
        title: clubChatTopics.title,
        isAdminOnly: clubChatTopics.isAdminOnly,
        isPublished: clubChatTopics.isPublished
      },
      user: {
        id: users.id,
        telegramId: users.telegramId,
        firstName: users.firstName,
        username: users.username,
        displayName: users.displayName,
        photoUrl: users.photoUrl,
        avatarPositionX: users.avatarPositionX,
        avatarPositionY: users.avatarPositionY,
        avatarScale: users.avatarScale
      },
      hasQuarantinedAttachment
    })
    .from(clubChatMessages)
    .innerJoin(clubChatTopics, eq(clubChatTopics.id, clubChatMessages.topicId))
    .innerJoin(users, eq(users.id, clubChatMessages.userId))
    .where(
      and(
        searchableMessageCondition(),
        input.role === "member"
          ? and(eq(clubChatTopics.isPublished, true), eq(clubChatTopics.isAdminOnly, false))
          : undefined,
        input.topicId ? eq(clubChatMessages.topicId, input.topicId) : undefined,
        input.before ? lt(clubChatMessages.createdAt, new Date(input.before)) : undefined,
        or(
          sql`to_tsvector('simple', coalesce(${clubChatMessages.body}, '')) @@ websearch_to_tsquery('simple', ${normalizedQuery})`,
          sql`lower(regexp_replace(concat_ws(' ', coalesce(${users.displayName}, ''), coalesce(${users.firstName}, ''), coalesce(${users.username}, '')), '\\s+', ' ', 'g')) like ${authorPattern} escape '\\'`
        )
      )
    )
    .orderBy(desc(clubChatMessages.createdAt), desc(clubChatMessages.id))
    .limit(limit + 1);

  const discoverableRows = rows.filter((row) =>
    isMessageDiscoverable({
      role: input.role,
      topic: row.topic,
      message: row.message,
      hasQuarantinedAttachment: row.hasQuarantinedAttachment
    })
  );
  const hasMore = discoverableRows.length > limit;
  const page = discoverableRows.slice(0, limit);

  return {
    results: page.map((row) => ({
      messageId: row.message.id,
      topicId: row.message.topicId,
      topicTitle: row.topic.title,
      author: buildMessageAuthor(row.user),
      excerpt: buildSearchExcerpt(row.message.body, tokens),
      createdAt: row.message.createdAt.toISOString()
    })),
    nextCursor: hasMore ? page.at(-1)?.message.createdAt.toISOString() ?? null : null
  };
}

export async function loadMessageContext(input: {
  topicId: string;
  messageId: string;
  before: number;
  after: number;
}) {
  const { db } = await import("../db/client");
  const target = await db.query.clubChatMessages.findFirst({
    where: and(
      eq(clubChatMessages.id, input.messageId),
      eq(clubChatMessages.topicId, input.topicId),
      searchableMessageCondition()
    ),
    with: { user: true }
  });
  if (!target) return null;

  const beforeLimit = normalizeContextWindow(input.before);
  const afterLimit = normalizeContextWindow(input.after);
  const [beforeRows, afterRows] = await Promise.all([
    beforeLimit
      ? db.query.clubChatMessages.findMany({
          where: and(
            eq(clubChatMessages.topicId, input.topicId),
            searchableMessageCondition(),
            or(
              lt(clubChatMessages.createdAt, target.createdAt),
              and(eq(clubChatMessages.createdAt, target.createdAt), lt(clubChatMessages.id, target.id))
            )
          ),
          orderBy: [desc(clubChatMessages.createdAt), desc(clubChatMessages.id)],
          limit: beforeLimit,
          with: { user: true }
        })
      : Promise.resolve([]),
    afterLimit
      ? db.query.clubChatMessages.findMany({
          where: and(
            eq(clubChatMessages.topicId, input.topicId),
            searchableMessageCondition(),
            or(
              gt(clubChatMessages.createdAt, target.createdAt),
              and(eq(clubChatMessages.createdAt, target.createdAt), gt(clubChatMessages.id, target.id))
            )
          ),
          orderBy: [asc(clubChatMessages.createdAt), asc(clubChatMessages.id)],
          limit: afterLimit,
          with: { user: true }
        })
      : Promise.resolve([])
  ]);

  return {
    targetMessageId: target.id,
    messages: [...beforeRows.reverse(), target, ...afterRows]
  };
}
