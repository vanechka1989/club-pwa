import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "../db/client";
import {
  contentCategories,
  contentItems,
  homeworkSubmissions,
  learningEngagementSessions,
  quizAttempts,
  userContentProgress,
  users
} from "../db/schema";
import {
  summarizeLearningEngagement,
  summarizeLearningEngagementUsers,
  type LearningEngagementSample
} from "../learning/engagement";
export { resolveLearningEngagementRange } from "./learningEngagementRange";

function memberName(row: { displayName: string | null; firstName: string | null; username: string | null; email: string | null }) {
  return row.displayName?.trim() || row.firstName?.trim() || row.username?.trim() || row.email || "Клиент";
}

async function loadSamples(from: Date, toExclusive: Date, contentItemId?: string) {
  const rows = await db
    .select({
      sessionId: learningEngagementSessions.sessionId,
      userId: learningEngagementSessions.userId,
      telegramId: users.telegramId,
      contentItemId: learningEngagementSessions.contentItemId,
      title: contentItems.title,
      categoryTitle: contentCategories.title,
      activeSeconds: learningEngagementSessions.activeSeconds,
      videoSeconds: learningEngagementSessions.videoSeconds,
      playbackPositionSeconds: learningEngagementSessions.playbackPositionSeconds,
      openedAt: learningEngagementSessions.openedAt,
      lastActivityAt: learningEngagementSessions.lastActivityAt,
      closedAt: learningEngagementSessions.closedAt,
      completedAt: userContentProgress.completedAt,
      displayName: users.displayName,
      firstName: users.firstName,
      username: users.username,
      email: users.email
    })
    .from(learningEngagementSessions)
    .innerJoin(contentItems, eq(contentItems.id, learningEngagementSessions.contentItemId))
    .innerJoin(contentCategories, eq(contentCategories.id, contentItems.categoryId))
    .innerJoin(users, eq(users.id, learningEngagementSessions.userId))
    .leftJoin(
      userContentProgress,
      and(
        eq(userContentProgress.userId, learningEngagementSessions.userId),
        eq(userContentProgress.contentItemId, learningEngagementSessions.contentItemId)
      )
    )
    .where(and(
      gte(learningEngagementSessions.lastActivityAt, from),
      lt(learningEngagementSessions.lastActivityAt, toExclusive),
      contentItemId ? eq(learningEngagementSessions.contentItemId, contentItemId) : undefined
    ));

  return rows.map((row): LearningEngagementSample => ({
    sessionId: row.sessionId,
    userId: row.userId,
    telegramId: row.telegramId,
    contentItemId: row.contentItemId,
    title: row.title,
    categoryTitle: row.categoryTitle,
    activeSeconds: row.activeSeconds,
    videoSeconds: row.videoSeconds,
    playbackPositionSeconds: row.playbackPositionSeconds,
    openedAt: row.openedAt,
    lastActivityAt: row.lastActivityAt,
    closedAt: row.closedAt,
    completed: Boolean(row.completedAt),
    displayName: memberName(row),
    email: row.email
  }));
}

export async function getLearningEngagementDashboard(from: Date, toExclusive: Date) {
  const [samples, homework, quizzes] = await Promise.all([
    loadSamples(from, toExclusive),
    db.select({ status: homeworkSubmissions.status }).from(homeworkSubmissions).where(and(
      gte(homeworkSubmissions.submittedAt, from),
      lt(homeworkSubmissions.submittedAt, toExclusive)
    )),
    db.select({ status: quizAttempts.status }).from(quizAttempts).where(and(
      gte(quizAttempts.submittedAt, from),
      lt(quizAttempts.submittedAt, toExclusive)
    ))
  ]);
  return {
    ...summarizeLearningEngagement(samples),
    assessments: {
      homeworkSubmitted: homework.length,
      homeworkAccepted: homework.filter((entry) => entry.status === "accepted").length,
      homeworkPendingReview: homework.filter((entry) => entry.status === "pending_review").length,
      homeworkNeedsRevision: homework.filter((entry) => entry.status === "needs_revision").length,
      quizSubmitted: quizzes.filter((entry) => entry.status !== "in_progress").length,
      quizPassed: quizzes.filter((entry) => entry.status === "passed").length
    }
  };
}

export async function getLearningEngagementUsers(contentItemId: string, from: Date, toExclusive: Date) {
  const item = await db
    .select({ id: contentItems.id, title: contentItems.title, categoryTitle: contentCategories.title })
    .from(contentItems)
    .innerJoin(contentCategories, eq(contentCategories.id, contentItems.categoryId))
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item[0]) return null;
  return {
    item: item[0],
    users: summarizeLearningEngagementUsers(await loadSamples(from, toExclusive, contentItemId))
  };
}
