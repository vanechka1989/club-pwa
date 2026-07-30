import type { ModerationStatus, UserRole } from "@club/shared";
import { and, asc, desc, eq, gt, isNull, lt, not, or, sql } from "drizzle-orm";
import { clubChatMessages, clubChatTopics, users } from "../db/schema";
import { buildMessageAuthor } from "./messageMetadata";
import { preciseCommunityMessageCreatedAt } from "./messageTimestamp";
import { isTopicAccessibleForRole } from "./topicAccess";

const maximumExcerptLength = 500;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const postgresTimestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{6})Z$/;

export type SearchCursor = { createdAt: string; messageId: string };
type MessageSearchDatabase = typeof import("../db/client").db;

export type MessageSearchInput = {
  query: string;
  topicId?: string;
  before?: SearchCursor;
  limit: number;
  role: UserRole;
};

export type MessageContextInput = {
  topicId: string;
  messageId: string;
  before: number;
  after: number;
};

export type SafeReplyInput = { topicId: string; messageId: string };

export function encodeSearchCursor(cursor: SearchCursor) {
  return Buffer.from(`${cursor.createdAt}|${cursor.messageId}`, "utf8").toString("base64url");
}

function isValidPostgresTimestamp(value: string) {
  const match = postgresTimestampPattern.exec(value);
  if (!match) return false;
  const [, yearValue, monthValue, dayValue, hourValue, minuteValue, secondValue] = match;
  const [year, month, day, hour, minute, second] = [
    yearValue,
    monthValue,
    dayValue,
    hourValue,
    minuteValue,
    secondValue
  ].map(Number);
  if (year! < 1 || hour! > 23 || minute! > 59 || second! > 59) return false;
  const calendar = new Date(0);
  calendar.setUTCHours(0, 0, 0, 0);
  calendar.setUTCFullYear(year!, month! - 1, day!);
  return (
    calendar.getUTCFullYear() === year
    && calendar.getUTCMonth() === month! - 1
    && calendar.getUTCDate() === day
  );
}

export function decodeSearchCursor(cursor: string): SearchCursor | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const separator = decoded.indexOf("|");
    if (separator < 0 || decoded.indexOf("|", separator + 1) >= 0) return null;
    const createdAtValue = decoded.slice(0, separator);
    const messageId = decoded.slice(separator + 1);
    if (
      !uuidPattern.test(messageId)
      || !isValidPostgresTimestamp(createdAtValue)
    ) {
      return null;
    }
    return { createdAt: createdAtValue, messageId };
  } catch {
    return null;
  }
}

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
  from "club_message_attachments" attachment
  where attachment."message_id" = ${clubChatMessages.id}
    and (attachment."scan_status" <> 'ready' or attachment."deleted_at" is not null)
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

async function searchCommunityMessagesWithDatabase(db: MessageSearchDatabase, input: MessageSearchInput) {
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
      cursorCreatedAt: preciseCommunityMessageCreatedAt(),
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
        input.before
          ? or(
              sql`${clubChatMessages.createdAt} < ${input.before.createdAt}::timestamptz`,
              and(
                sql`${clubChatMessages.createdAt} = ${input.before.createdAt}::timestamptz`,
                lt(clubChatMessages.id, input.before.messageId)
              )
            )
          : undefined,
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
  const lastRow = page.at(-1);

  return {
    results: page.map((row) => ({
      messageId: row.message.id,
      topicId: row.message.topicId,
      topicTitle: row.topic.title,
      author: buildMessageAuthor(row.user),
      excerpt: buildSearchExcerpt(row.message.body, tokens),
      createdAt: row.cursorCreatedAt
    })),
    nextCursor: hasMore && lastRow
      ? encodeSearchCursor({ createdAt: lastRow.cursorCreatedAt, messageId: lastRow.message.id })
      : null
  };
}

async function loadMessageContextWithDatabase(db: MessageSearchDatabase, input: MessageContextInput) {
  const [targetRow] = await db
    .select({ message: clubChatMessages, user: users, cursorCreatedAt: preciseCommunityMessageCreatedAt() })
    .from(clubChatMessages)
    .innerJoin(users, eq(users.id, clubChatMessages.userId))
    .where(and(
      eq(clubChatMessages.id, input.messageId),
      eq(clubChatMessages.topicId, input.topicId),
      searchableMessageCondition()
    ))
    .limit(1);
  if (!targetRow) return null;
  const target = {
    ...targetRow.message,
    preciseCreatedAt: targetRow.cursorCreatedAt,
    user: targetRow.user
  };

  const beforeLimit = normalizeContextWindow(input.before);
  const afterLimit = normalizeContextWindow(input.after);
  const [beforeRows, afterRows] = await Promise.all([
    beforeLimit
      ? db.select({
          message: clubChatMessages,
          user: users,
          preciseCreatedAt: preciseCommunityMessageCreatedAt()
        })
          .from(clubChatMessages)
          .innerJoin(users, eq(users.id, clubChatMessages.userId))
          .where(and(
            eq(clubChatMessages.topicId, input.topicId),
            searchableMessageCondition(),
            or(
              sql`${clubChatMessages.createdAt} < ${targetRow.cursorCreatedAt}::timestamptz`,
              and(
                sql`${clubChatMessages.createdAt} = ${targetRow.cursorCreatedAt}::timestamptz`,
                lt(clubChatMessages.id, target.id)
              )
            )
          ))
          .orderBy(desc(clubChatMessages.createdAt), desc(clubChatMessages.id))
          .limit(beforeLimit)
      : Promise.resolve([]),
    afterLimit
      ? db.select({
          message: clubChatMessages,
          user: users,
          preciseCreatedAt: preciseCommunityMessageCreatedAt()
        })
          .from(clubChatMessages)
          .innerJoin(users, eq(users.id, clubChatMessages.userId))
          .where(and(
            eq(clubChatMessages.topicId, input.topicId),
            searchableMessageCondition(),
            or(
              sql`${clubChatMessages.createdAt} > ${targetRow.cursorCreatedAt}::timestamptz`,
              and(
                sql`${clubChatMessages.createdAt} = ${targetRow.cursorCreatedAt}::timestamptz`,
                gt(clubChatMessages.id, target.id)
              )
            )
          ))
          .orderBy(asc(clubChatMessages.createdAt), asc(clubChatMessages.id))
          .limit(afterLimit)
      : Promise.resolve([])
  ]);

  const beforeMessages = beforeRows.map((row) => ({
    ...row.message,
    preciseCreatedAt: row.preciseCreatedAt,
    user: row.user
  }));
  const afterMessages = afterRows.map((row) => ({
    ...row.message,
    preciseCreatedAt: row.preciseCreatedAt,
    user: row.user
  }));

  return {
    targetMessageId: target.id,
    messages: [...beforeMessages.reverse(), target, ...afterMessages]
  };
}

async function loadSafeReplyWithDatabase(db: MessageSearchDatabase, input: SafeReplyInput) {
  return (await db.query.clubChatMessages.findFirst({
    where: and(
      eq(clubChatMessages.id, input.messageId),
      eq(clubChatMessages.topicId, input.topicId),
      searchableMessageCondition()
    ),
    with: { user: true }
  })) ?? null;
}

export function createMessageSearchRepository(database: MessageSearchDatabase) {
  return {
    search: (input: MessageSearchInput) => searchCommunityMessagesWithDatabase(database, input),
    loadContext: (input: MessageContextInput) => loadMessageContextWithDatabase(database, input),
    loadSafeReply: (input: SafeReplyInput) => loadSafeReplyWithDatabase(database, input)
  };
}

export async function searchCommunityMessages(input: MessageSearchInput) {
  const { db } = await import("../db/client");
  return createMessageSearchRepository(db).search(input);
}

export async function loadMessageContext(input: MessageContextInput) {
  const { db } = await import("../db/client");
  return createMessageSearchRepository(db).loadContext(input);
}

export async function loadSafeReplyMessage(input: SafeReplyInput) {
  const { db } = await import("../db/client");
  return createMessageSearchRepository(db).loadSafeReply(input);
}
