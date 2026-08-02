import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, notExists, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import { learningEngagementSnapshotSchema, lessonAssessmentDraftSchema, type LessonAssessmentConfig } from "@club/shared";
import { assessmentReviews, contentCategories, contentItems, homeworkAttachments, homeworkSubmissions, learningEngagementSessions, lessonAssessmentOptions, lessonAssessmentQuestions, lessonAssessmentRevisions, lessonComments, lessonMaterials, quizAnswers, quizAttemptQuestions, quizAttemptResets, quizAttempts, userContentProgress, userLearningFavorites } from "../db/schema";
import { db } from "../db/client";
import { buildMessageAuthor } from "../community/messageMetadata";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { requireActiveMember } from "../middleware/requireActiveMember";
import { getObjectMetadata, getObjectReadUrl, uploadObjectStream } from "../storage/s3";
import { decodeModuleCategoryDefaultCardLayout, decodeModuleCategoryDescription, isModuleCategoryDescription } from "../learning/moduleCategory";
import { getFirstVisualLessonCoverUrl } from "../learning/lessonCover";
import { mergeEngagementCounters } from "../learning/engagement";
import { serializeLearningProgressRows } from "../learning/learningProgress";
import { serializeHomeworkReviewNotice } from "../learning/homeworkReviewNotice";
import { toPublicAssessment } from "../learning/assessmentConfig";
import { scoreQuizAttempt } from "../learning/assessmentScoring";
import { getQuizAttemptAllowance } from "../learning/assessmentAttemptPolicy";
import { verifyUploadedObjectMetadata } from "../learning/directUploadVerification";
import { classifyHomeworkContentType, createHomeworkUploadIntent, ownsHomeworkObject, validateHomeworkUploadStreamRequest } from "../learning/homeworkUpload";
import { buildQuizAttemptReview } from "../learning/assessmentStatusResult";
import { logger } from "../logger";

const commentPayloadSchema = z.object({
  body: z.string().trim().min(1).max(2000)
});

const playbackPayloadSchema = z.object({
  positionSeconds: z.number().int().min(0).max(24 * 60 * 60),
  materialId: z.string().uuid().nullable().optional()
});

const quizSubmissionSchema = z.object({
  submissionKey: z.string().min(8).max(128),
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    selectedOptionIds: z.array(z.string().min(1)).max(20).default([]),
    text: z.string().trim().max(8000).nullable().default(null)
  })).max(100)
});

const quizAnswerDraftSchema = quizSubmissionSchema.pick({ answers: true });

const homeworkUploadIntentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(160),
  sizeBytes: z.number().int().positive().max(100 * 1024 * 1024)
});

const homeworkUploadStreamSchema = homeworkUploadIntentSchema.extend({
  objectKey: z.string().min(1).max(1000)
});

const homeworkSubmissionSchema = z.object({
  submissionKey: z.string().min(8).max(128),
  text: z.string().trim().max(20_000).nullable().default(null),
  attachments: z.array(z.object({
    objectKey: z.string().min(1).max(1000),
    fileName: z.string().trim().min(1).max(255),
    contentType: z.string().trim().min(1).max(160),
    sizeBytes: z.number().int().positive().max(100 * 1024 * 1024)
  })).max(10).default([])
});

function publishedContentWhere() {
  return and(eq(contentItems.isPublished, true), or(isNull(contentItems.archivedUntil), gt(contentItems.archivedUntil, new Date())));
}

async function serializeContentItem(item: typeof contentItems.$inferSelect, includeBody = false) {
  const mediaUrl = item.mediaObjectKey ? await getObjectReadUrl(item.mediaObjectKey) : item.mediaUrl;
  const thumbnailUrl = item.thumbnailObjectKey ? await getObjectReadUrl(item.thumbnailObjectKey) : item.thumbnailUrl;
  const shouldLoadCoverMaterials = item.coverMode === "first_material";
  const rawMaterials = includeBody || shouldLoadCoverMaterials
    ? await db.query.lessonMaterials.findMany({
        where: eq(lessonMaterials.contentItemId, item.id),
        orderBy: [asc(lessonMaterials.sortOrder), asc(lessonMaterials.createdAt)]
      })
    : [];
  const serializedMaterials = await Promise.all(
    rawMaterials.map(async (material) => ({
      id: material.id,
      kind: material.kind,
      title: material.title,
      description: material.description,
      body: material.body,
      mediaUrl: material.mediaObjectKey ? await getObjectReadUrl(material.mediaObjectKey) : material.mediaUrl,
      mediaSource: material.mediaObjectKey ? "s3" as const : material.mediaUrl ? "external" as const : null,
      mediaContentType: material.mediaContentType,
      mediaSizeBytes: material.mediaSizeBytes
    }))
  );

  const assessment = includeBody ? await getPublicAssessment(item) : undefined;
  return {
    id: item.id,
    categoryId: item.categoryId,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    body: includeBody ? item.body : null,
    mediaUrl,
    mediaSource: item.mediaObjectKey ? "s3" : item.mediaUrl ? "external" : null,
    thumbnailUrl,
    coverMode: item.coverMode === "custom" || item.coverMode === "first_material" ? item.coverMode : "default",
    coverSourceUrl: getFirstVisualLessonCoverUrl({ kind: item.kind, mediaUrl }, serializedMaterials),
    cardLayout: item.cardLayout === "horizontal" ? "horizontal" : "vertical",
    mediaContentType: item.mediaContentType,
    mediaSizeBytes: item.mediaSizeBytes,
    materials: includeBody ? serializedMaterials : [],
    publishedAt: item.publishedAt?.toISOString() ?? null,
    assessment
  };
}

async function getPublicAssessment(item: typeof contentItems.$inferSelect): Promise<LessonAssessmentConfig> {
  if (!item.publishedAssessmentRevisionId || item.assessmentMode === "none") return { mode: "none" };
  const revision = await db.query.lessonAssessmentRevisions.findFirst({
    where: eq(lessonAssessmentRevisions.id, item.publishedAssessmentRevisionId)
  });
  if (!revision) return { mode: "none" };
  if (revision.mode === "homework") {
    return lessonAssessmentDraftSchema.parse({
      mode: "homework",
      title: revision.title,
      instructions: revision.instructions ?? "",
      dueAt: revision.dueAt?.toISOString() ?? null,
      allowText: revision.allowText ?? false,
      allowAttachments: revision.allowAttachments ?? false,
      allowedFileKinds: revision.allowedFileKinds ?? [],
      maxAttachments: revision.maxAttachments ?? 5
    });
  }
  const questions = await db.select().from(lessonAssessmentQuestions)
    .where(eq(lessonAssessmentQuestions.revisionId, revision.id)).orderBy(asc(lessonAssessmentQuestions.sortOrder));
  const options = questions.length
    ? await db.select().from(lessonAssessmentOptions)
        .where(inArray(lessonAssessmentOptions.questionId, questions.map((question) => question.id)))
        .orderBy(asc(lessonAssessmentOptions.sortOrder))
    : [];
  const privateDraft = lessonAssessmentDraftSchema.parse({
    mode: "quiz",
    title: revision.title,
    instructions: revision.instructions,
    passingPercent: revision.passingPercent,
    maxAttempts: revision.maxAttempts,
    questions: questions.map((question) => ({
      id: question.stableKey,
      type: question.type,
      prompt: question.prompt,
      points: question.points,
      options: options.filter((option) => option.questionId === question.id).map((option) => ({ id: option.stableKey, text: option.text })),
      correctOptionIds: options.filter((option) => option.questionId === question.id && option.isCorrect).map((option) => option.stableKey)
    }))
  });
  return toPublicAssessment(privateDraft);
}

function serializeComment(
  comment: typeof lessonComments.$inferSelect & {
    user: {
      id: string;
      telegramId: string;
      firstName: string | null;
      username: string | null;
      photoUrl: string | null;
      avatarPositionX?: number | null;
      avatarPositionY?: number | null;
      avatarScale?: number | null;
    };
  }
) {
  return {
    id: comment.id,
    contentItemId: comment.contentItemId,
    body: comment.body,
    status: comment.status,
    author: buildMessageAuthor(comment.user),
    createdAt: comment.createdAt.toISOString()
  };
}

export const learningRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .get("/", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const rawCategories = await db
      .select({
        id: contentCategories.id,
        slug: contentCategories.slug,
        title: contentCategories.title,
        description: contentCategories.description,
        isPublished: contentCategories.isPublished,
        archivedUntil: contentCategories.archivedUntil,
        itemsCount: count(contentItems.id)
      })
      .from(contentCategories)
      .leftJoin(
        contentItems,
        and(eq(contentItems.categoryId, contentCategories.id), publishedContentWhere())
      )
      .where(and(eq(contentCategories.isPublished, true), isNull(contentCategories.archivedUntil)))
      .groupBy(contentCategories.id)
      .orderBy(contentCategories.sortOrder);

    const categories = rawCategories
      .filter((category) => isModuleCategoryDescription(category.description))
      .map((category) => ({
        ...category,
        archivedUntil: null,
        description: decodeModuleCategoryDescription(category.description),
        defaultCardLayout: decodeModuleCategoryDefaultCardLayout(category.description)
      }));
    const categoryIds = categories.map((category) => category.id);
    const moduleContentWhere = categoryIds.length
      ? and(inArray(contentItems.categoryId, categoryIds), publishedContentWhere())
      : null;

    const featured = moduleContentWhere
      ? await db.query.contentItems.findMany({
          where: moduleContentWhere,
          orderBy: [asc(contentItems.sortOrder), desc(contentItems.publishedAt)]
        })
      : [];

    const [totalItemsRow] = moduleContentWhere
      ? await db
          .select({
            value: count(contentItems.id)
          })
          .from(contentItems)
          .where(moduleContentWhere)
      : [{ value: 0 }];

    const progressRows = moduleContentWhere
      ? await db
          .select({
            contentItemId: userContentProgress.contentItemId,
            completedAt: userContentProgress.completedAt
          })
          .from(userContentProgress)
          .innerJoin(contentItems, eq(contentItems.id, userContentProgress.contentItemId))
          .where(and(eq(userContentProgress.userId, userId), moduleContentWhere))
      : [];
    const serializedProgress = serializeLearningProgressRows(progressRows);
    const favoriteRows = moduleContentWhere
      ? await db
          .select({ contentItemId: userLearningFavorites.contentItemId })
          .from(userLearningFavorites)
          .innerJoin(contentItems, eq(contentItems.id, userLearningFavorites.contentItemId))
          .where(and(eq(userLearningFavorites.userId, userId), moduleContentWhere))
      : [];

    const [lastOpenedRow] = moduleContentWhere
      ? await db
          .select({ progress: userContentProgress, item: contentItems })
          .from(userContentProgress)
          .innerJoin(contentItems, eq(contentItems.id, userContentProgress.contentItemId))
          .where(and(eq(userContentProgress.userId, userId), moduleContentWhere))
          .orderBy(desc(userContentProgress.lastOpenedAt))
          .limit(1)
      : [];
    const lastOpenedProgress = lastOpenedRow?.progress ?? null;
    const lastOpenedItem = lastOpenedRow?.item ?? null;
    const newerHomeworkSubmission = alias(homeworkSubmissions, "newer_homework_submission");
    const [latestHomeworkReviewRow] = moduleContentWhere
      ? await db
          .select({
            contentItemId: homeworkSubmissions.contentItemId,
            status: homeworkSubmissions.status,
            reviewedAt: homeworkSubmissions.reviewedAt,
            reviewComment: assessmentReviews.comment
          })
          .from(homeworkSubmissions)
          .innerJoin(contentItems, eq(contentItems.id, homeworkSubmissions.contentItemId))
          .leftJoin(assessmentReviews, eq(assessmentReviews.homeworkSubmissionId, homeworkSubmissions.id))
          .where(and(
            eq(homeworkSubmissions.userId, userId),
            moduleContentWhere,
            inArray(homeworkSubmissions.status, ["needs_revision", "accepted"]),
            isNotNull(homeworkSubmissions.reviewedAt),
            notExists(
              db
                .select({ id: newerHomeworkSubmission.id })
                .from(newerHomeworkSubmission)
                .where(and(
                  eq(newerHomeworkSubmission.userId, homeworkSubmissions.userId),
                  eq(newerHomeworkSubmission.contentItemId, homeworkSubmissions.contentItemId),
                  gt(newerHomeworkSubmission.version, homeworkSubmissions.version)
                ))
            )
          ))
          .orderBy(desc(homeworkSubmissions.reviewedAt))
          .limit(1)
      : [];

    return c.json({
      categories,
      featured: await Promise.all(featured.map((item) => serializeContentItem(item))),
      progress: {
        totalItems: totalItemsRow?.value ?? 0,
        completedItems: serializedProgress.completedItemIds.length,
        ...serializedProgress,
        favoriteItemIds: favoriteRows.map((row) => row.contentItemId),
        lastOpenedItem: lastOpenedItem ? await serializeContentItem(lastOpenedItem, true) : null,
        lastOpenedMaterialId: lastOpenedItem ? lastOpenedProgress?.lastOpenedMaterialId ?? null : null,
        lastOpenedAt: lastOpenedProgress?.lastOpenedAt.toISOString() ?? null,
        lastOpenedPlaybackPositionSeconds: lastOpenedItem ? lastOpenedProgress?.playbackPositionSeconds ?? 0 : 0,
        latestHomeworkReview: serializeHomeworkReviewNotice(latestHomeworkReviewRow)
      }
    });
  })
  .get("/items/:id", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const item = await db.query.contentItems.findFirst({
      where: and(eq(contentItems.id, c.req.param("id")), publishedContentWhere())
    });

    if (!item) {
      return c.json({ error: "Learning content not found" }, 404);
    }

    const now = new Date();
    const [progress] = await db
      .insert(userContentProgress)
      .values({
        userId,
        contentItemId: item.id,
        lastOpenedAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [userContentProgress.userId, userContentProgress.contentItemId],
        set: {
          lastOpenedAt: now,
          updatedAt: now
        }
      })
      .returning();

    return c.json({
      item: await serializeContentItem(item, true),
      completedAt: progress?.completedAt?.toISOString() ?? null,
      lastOpenedMaterialId: progress?.lastOpenedMaterialId ?? null,
      playbackPositionSeconds: progress?.playbackPositionSeconds ?? 0
    });
  })
  .post("/items/:id/playback", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const body = playbackPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid playback payload" }, 400);
    }

    const item = await db.query.contentItems.findFirst({
      where: and(eq(contentItems.id, c.req.param("id")), publishedContentWhere())
    });

    if (!item) {
      return c.json({ error: "Learning content not found" }, 404);
    }

    const materialId = body.data.materialId ?? null;
    if (materialId) {
      const material = await db.query.lessonMaterials.findFirst({
        where: and(eq(lessonMaterials.id, materialId), eq(lessonMaterials.contentItemId, item.id))
      });
      if (!material) {
        return c.json({ error: "Lesson material not found" }, 404);
      }
    }

    const now = new Date();
    const [progress] = await db
      .insert(userContentProgress)
      .values({
        userId,
        contentItemId: item.id,
        lastOpenedMaterialId: materialId,
        playbackPositionSeconds: body.data.positionSeconds,
        lastOpenedAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [userContentProgress.userId, userContentProgress.contentItemId],
        set: {
          lastOpenedMaterialId: materialId,
          playbackPositionSeconds: body.data.positionSeconds,
          lastOpenedAt: now,
          updatedAt: now
        }
      })
      .returning();

    return c.json({
      ok: true,
      lastOpenedMaterialId: progress?.lastOpenedMaterialId ?? materialId,
      playbackPositionSeconds: progress?.playbackPositionSeconds ?? body.data.positionSeconds
    });
  })
  .post("/items/:id/engagement", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const body = learningEngagementSnapshotSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid learning engagement payload" }, 400);
    }

    const item = await db.query.contentItems.findFirst({
      where: and(eq(contentItems.id, c.req.param("id")), publishedContentWhere())
    });
    if (!item) {
      return c.json({ error: "Learning content not found" }, 404);
    }

    const materialId = body.data.materialId;
    if (materialId) {
      const material = await db.query.lessonMaterials.findFirst({
        where: and(eq(lessonMaterials.id, materialId), eq(lessonMaterials.contentItemId, item.id))
      });
      if (!material) {
        return c.json({ error: "Lesson material not found" }, 404);
      }
    }

    let existing = await db.query.learningEngagementSessions.findFirst({
      where: eq(learningEngagementSessions.sessionId, body.data.sessionId)
    });
    if (existing && (existing.userId !== userId || existing.contentItemId !== item.id)) {
      return c.json({ error: "Learning engagement session belongs to another member" }, 409);
    }

    const now = new Date();
    if (!existing) {
      const [created] = await db
        .insert(learningEngagementSessions)
        .values({
          sessionId: body.data.sessionId,
          userId,
          contentItemId: item.id,
          materialId,
          activeSeconds: body.data.activeSeconds,
          videoSeconds: Math.min(body.data.videoSeconds, body.data.activeSeconds),
          playbackPositionSeconds: body.data.playbackPositionSeconds,
          openedAt: now,
          lastActivityAt: now,
          closedAt: body.data.closed ? now : null,
          updatedAt: now
        })
        .onConflictDoNothing()
        .returning();
      if (created) {
        return c.json({ ok: true });
      }
      existing = await db.query.learningEngagementSessions.findFirst({
        where: eq(learningEngagementSessions.sessionId, body.data.sessionId)
      });
      if (!existing || existing.userId !== userId || existing.contentItemId !== item.id) {
        return c.json({ error: "Learning engagement session belongs to another member" }, 409);
      }
    }

    const counters = mergeEngagementCounters(existing, body.data);
    await db
      .update(learningEngagementSessions)
      .set({
        materialId,
        ...counters,
        lastActivityAt: now,
        closedAt: existing.closedAt ?? (body.data.closed ? now : null),
        updatedAt: now
      })
      .where(and(
        eq(learningEngagementSessions.sessionId, body.data.sessionId),
        eq(learningEngagementSessions.userId, userId)
      ));

    return c.json({ ok: true });
  })
  .get("/items/:id/assessment/status", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const item = await db.query.contentItems.findFirst({ where: and(eq(contentItems.id, c.req.param("id")), publishedContentWhere()) });
    if (!item) return c.json({ error: "Learning content not found" }, 404);
    const attempts = item.assessmentMode === "quiz"
      ? await db.query.quizAttempts.findMany({
          where: and(eq(quizAttempts.userId, userId), eq(quizAttempts.contentItemId, item.id)),
          orderBy: [desc(quizAttempts.attemptNumber)]
        })
      : [];
    const submissions = item.assessmentMode === "homework"
      ? await db.query.homeworkSubmissions.findMany({
          where: and(eq(homeworkSubmissions.userId, userId), eq(homeworkSubmissions.contentItemId, item.id)),
          orderBy: [desc(homeworkSubmissions.version)]
        })
      : [];
    const submittedAttemptIds = attempts.filter((attempt) => attempt.status !== "in_progress").map((attempt) => attempt.id);
    const attemptQuestions = submittedAttemptIds.length
      ? await db.query.quizAttemptQuestions.findMany({
          where: inArray(quizAttemptQuestions.attemptId, submittedAttemptIds),
          orderBy: [asc(quizAttemptQuestions.sortOrder)]
        })
      : [];
    const attemptAnswers = submittedAttemptIds.length
      ? await db.query.quizAnswers.findMany({ where: inArray(quizAnswers.attemptId, submittedAttemptIds) })
      : [];
    const reviews = attempts.length || submissions.length
      ? await db.query.assessmentReviews.findMany({
          where: or(
            attempts.length ? inArray(assessmentReviews.quizAttemptId, attempts.map((attempt) => attempt.id)) : undefined,
            submissions.length ? inArray(assessmentReviews.homeworkSubmissionId, submissions.map((submission) => submission.id)) : undefined
          )
        })
      : [];
    return c.json({
      mode: item.assessmentMode,
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        earnedPoints: attempt.earnedPoints,
        maxPoints: attempt.maxPoints,
        percent: attempt.percent,
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        reviewComment: reviews.find((review) => review.quizAttemptId === attempt.id)?.comment ?? null,
        questions: buildQuizAttemptReview(
          attempt.status,
          attemptQuestions.filter((question) => question.attemptId === attempt.id),
          attemptAnswers.filter((answer) => answer.attemptId === attempt.id)
        )
      })),
      submissions: submissions.map((submission) => ({
        id: submission.id,
        version: submission.version,
        status: submission.status,
        submittedAt: submission.submittedAt?.toISOString() ?? null,
        reviewedAt: submission.reviewedAt?.toISOString() ?? null,
        resetAt: submission.resetAt?.toISOString() ?? null,
        resetReason: submission.resetReason,
        reviewComment: reviews.find((review) => review.homeworkSubmissionId === submission.id)?.comment ?? null
      }))
    });
  })
  .post("/items/:id/homework/uploads", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const parsed = homeworkUploadIntentSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid homework file" }, 400);
    const item = await db.query.contentItems.findFirst({ where: and(eq(contentItems.id, c.req.param("id")), publishedContentWhere()) });
    if (!item || item.assessmentMode !== "homework" || !item.publishedAssessmentRevisionId) {
      return c.json({ error: "Homework is not configured for this lesson" }, 409);
    }
    const revision = await db.query.lessonAssessmentRevisions.findFirst({ where: eq(lessonAssessmentRevisions.id, item.publishedAssessmentRevisionId) });
    const kind = classifyHomeworkContentType(parsed.data.contentType);
    if (!revision?.allowAttachments || !kind || !revision.allowedFileKinds?.includes(kind)) {
      return c.json({ error: "This file type is not allowed for the homework" }, 400);
    }
    return c.json(createHomeworkUploadIntent({
      userId,
      lessonId: item.id,
      uploadToken: randomUUID(),
      input: parsed.data
    }));
  })
  .put("/items/:id/homework/uploads/:uploadToken", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const uploaded = homeworkUploadStreamSchema.safeParse({
      objectKey: c.req.query("objectKey"),
      fileName: c.req.query("fileName"),
      contentType: c.req.query("contentType"),
      sizeBytes: Number(c.req.query("sizeBytes"))
    });
    const expiresAt = z.coerce.date().safeParse(c.req.query("expiresAt"));
    if (!uploaded.success || !expiresAt.success) return c.json({ error: "Некорректные параметры загрузки." }, 400);

    const item = await db.query.contentItems.findFirst({ where: and(eq(contentItems.id, c.req.param("id")), publishedContentWhere()) });
    if (!item || item.assessmentMode !== "homework" || !item.publishedAssessmentRevisionId) {
      return c.json({ error: "Домашнее задание не настроено." }, 409);
    }
    const revision = await db.query.lessonAssessmentRevisions.findFirst({ where: eq(lessonAssessmentRevisions.id, item.publishedAssessmentRevisionId) });
    const kind = classifyHomeworkContentType(uploaded.data.contentType);
    if (!revision?.allowAttachments || !kind || !revision.allowedFileKinds?.includes(kind)) {
      return c.json({ error: "Этот тип файла нельзя прикрепить к заданию." }, 400);
    }

    const rawLength = Number(c.req.header("content-length"));
    const validation = validateHomeworkUploadStreamRequest({
      uploaded: uploaded.data,
      userId,
      uploadToken: c.req.param("uploadToken"),
      contentLength: Number.isSafeInteger(rawLength) ? rawLength : null,
      contentType: c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "",
      hasBody: Boolean(c.req.raw.body),
      expiresAt: expiresAt.data
    });
    if (!validation.ok) {
      const status = validation.error === "content_length_mismatch" ? 413 : 400;
      return c.json({ error: "Файл не прошёл проверку загрузки." }, status);
    }

    try {
      await uploadObjectStream({
        key: uploaded.data.objectKey,
        body: Readable.fromWeb(c.req.raw.body as never),
        contentType: uploaded.data.contentType,
        sizeBytes: uploaded.data.sizeBytes
      });
      return c.json({ ok: true });
    } catch (error) {
      logger.warn({ error, userId, objectKey: uploaded.data.objectKey }, "Unable to stream homework upload to S3");
      return c.json({ error: "Хранилище временно не приняло файл." }, 503);
    }
  })
  .post("/items/:id/homework/submit", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const parsed = homeworkSubmissionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid homework submission", details: parsed.error.flatten() }, 400);
    const existingIdempotent = await db.query.homeworkSubmissions.findFirst({ where: eq(homeworkSubmissions.submissionKey, parsed.data.submissionKey) });
    if (existingIdempotent) {
      if (existingIdempotent.userId !== userId || existingIdempotent.contentItemId !== c.req.param("id")) return c.json({ error: "Submission key is already used" }, 409);
      return c.json({ ok: true, submission: existingIdempotent });
    }
    const item = await db.query.contentItems.findFirst({ where: and(eq(contentItems.id, c.req.param("id")), publishedContentWhere()) });
    if (!item || item.assessmentMode !== "homework" || !item.publishedAssessmentRevisionId) {
      return c.json({ error: "Homework is not configured for this lesson" }, 409);
    }
    const revision = await db.query.lessonAssessmentRevisions.findFirst({ where: eq(lessonAssessmentRevisions.id, item.publishedAssessmentRevisionId) });
    if (!revision) return c.json({ error: "Homework revision not found" }, 409);
    if ((!revision.allowText && parsed.data.text) || (revision.allowText && !revision.allowAttachments && !parsed.data.text) ||
        (!revision.allowAttachments && parsed.data.attachments.length) || parsed.data.attachments.length > (revision.maxAttachments ?? 0) ||
        (!parsed.data.text && parsed.data.attachments.length === 0)) {
      return c.json({ error: "Homework answer does not match lesson settings" }, 400);
    }
    const latestSubmission = await db.query.homeworkSubmissions.findFirst({
      where: and(eq(homeworkSubmissions.userId, userId), eq(homeworkSubmissions.contentItemId, item.id)),
      orderBy: [desc(homeworkSubmissions.version)]
    });
    if (latestSubmission?.status === "pending_review") return c.json({ error: "Previous homework is still pending review" }, 409);
    if (latestSubmission?.status === "accepted") return c.json({ error: "Accepted homework cannot be submitted again" }, 409);

    for (const attachment of parsed.data.attachments) {
      const kind = classifyHomeworkContentType(attachment.contentType);
      if (!ownsHomeworkObject(attachment.objectKey, userId) || !kind || !revision.allowedFileKinds?.includes(kind)) {
        return c.json({ error: "Homework file does not belong to this user or has an unsupported type" }, 400);
      }
      const used = await db.query.homeworkAttachments.findFirst({ where: eq(homeworkAttachments.objectKey, attachment.objectKey) });
      if (used) return c.json({ error: "Homework file is already used" }, 409);
      const verification = await verifyUploadedObjectMetadata({
        expected: attachment,
        loadMetadata: (objectKey) => getObjectMetadata(objectKey)
      });
      if (!verification.ok) return c.json({ error: "Unable to verify homework file" }, 400);
    }

    const now = new Date();
    const submission = await db.transaction(async (tx) => {
      const [created] = await tx.insert(homeworkSubmissions).values({
        userId,
        contentItemId: item.id,
        revisionId: revision.id,
        version: (latestSubmission?.version ?? 0) + 1,
        status: "pending_review",
        text: parsed.data.text,
        submissionKey: parsed.data.submissionKey,
        submittedAt: now,
        createdAt: now,
        updatedAt: now
      }).returning();
      if (!created) throw new Error("Unable to submit homework");
      if (parsed.data.attachments.length) {
        await tx.insert(homeworkAttachments).values(parsed.data.attachments.map((attachment) => ({
          submissionId: created.id,
          ...attachment,
          confirmedAt: now,
          createdAt: now
        })));
      }
      return created;
    });
    return c.json({ ok: true, submission: { id: submission.id, version: submission.version, status: submission.status, submittedAt: submission.submittedAt?.toISOString() ?? null } });
  })
  .post("/items/:id/quiz/start", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const item = await db.query.contentItems.findFirst({
      where: and(eq(contentItems.id, c.req.param("id")), publishedContentWhere())
    });
    if (!item) return c.json({ error: "Learning content not found" }, 404);
    if (item.assessmentMode !== "quiz" || !item.publishedAssessmentRevisionId) {
      return c.json({ error: "Quiz is not configured for this lesson" }, 409);
    }
    const revision = await db.query.lessonAssessmentRevisions.findFirst({
      where: eq(lessonAssessmentRevisions.id, item.publishedAssessmentRevisionId)
    });
    if (!revision || !revision.maxAttempts) return c.json({ error: "Quiz revision not found" }, 409);

    let attempt = await db.query.quizAttempts.findFirst({
      where: and(eq(quizAttempts.userId, userId), eq(quizAttempts.contentItemId, item.id), eq(quizAttempts.status, "in_progress"))
    });
    if (!attempt) {
      const previous = await db.query.quizAttempts.findFirst({
        where: and(eq(quizAttempts.userId, userId), eq(quizAttempts.contentItemId, item.id)),
        orderBy: [desc(quizAttempts.attemptNumber)]
      });
      const attemptNumber = (previous?.attemptNumber ?? 0) + 1;
      const [resetTotal] = await db.select({ value: count() }).from(quizAttemptResets)
        .where(and(eq(quizAttemptResets.userId, userId), eq(quizAttemptResets.contentItemId, item.id)));
      const allowedAttempts = getQuizAttemptAllowance(revision.maxAttempts, Number(resetTotal?.value ?? 0));
      if (attemptNumber > allowedAttempts) return c.json({ error: "Quiz attempt limit reached" }, 409);

      attempt = await db.transaction(async (tx) => {
        const [created] = await tx.insert(quizAttempts).values({
          userId,
          contentItemId: item.id,
          revisionId: revision.id,
          attemptNumber
        }).returning();
        if (!created) throw new Error("Unable to start quiz attempt");
        const sourceQuestions = await tx.select().from(lessonAssessmentQuestions)
          .where(eq(lessonAssessmentQuestions.revisionId, revision.id)).orderBy(asc(lessonAssessmentQuestions.sortOrder));
        const sourceOptions = sourceQuestions.length
          ? await tx.select().from(lessonAssessmentOptions)
              .where(inArray(lessonAssessmentOptions.questionId, sourceQuestions.map((question) => question.id)))
              .orderBy(asc(lessonAssessmentOptions.sortOrder))
          : [];
        if (sourceQuestions.length) {
          await tx.insert(quizAttemptQuestions).values(sourceQuestions.map((question) => ({
            attemptId: created.id,
            sourceQuestionId: question.id,
            questionKey: question.stableKey,
            type: question.type,
            prompt: question.prompt,
            points: question.points,
            optionsSnapshot: sourceOptions.filter((option) => option.questionId === question.id).map((option) => ({ id: option.stableKey, text: option.text })),
            correctOptionIds: sourceOptions.filter((option) => option.questionId === question.id && option.isCorrect).map((option) => option.stableKey),
            sortOrder: question.sortOrder
          })));
        }
        return created;
      });
    }

    const questions = await db.select().from(quizAttemptQuestions)
      .where(eq(quizAttemptQuestions.attemptId, attempt.id)).orderBy(asc(quizAttemptQuestions.sortOrder));
    const savedAnswers = await db.query.quizAnswers.findMany({ where: eq(quizAnswers.attemptId, attempt.id) });
    return c.json({
      attempt: {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        maxAttempts: revision.maxAttempts,
        status: attempt.status,
        questions: questions.map(({ correctOptionIds: _correctOptionIds, sourceQuestionId: _sourceQuestionId, ...question }) => question),
        answers: savedAnswers.map((answer) => ({ questionId: answer.questionSnapshotId, selectedOptionIds: answer.selectedOptionIds, text: answer.text }))
      }
    });
  })
  .put("/items/:id/quiz/:attemptId/answers", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const parsed = quizAnswerDraftSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid quiz draft", details: parsed.error.flatten() }, 400);
    const attempt = await db.query.quizAttempts.findFirst({
      where: and(eq(quizAttempts.id, c.req.param("attemptId")), eq(quizAttempts.userId, userId), eq(quizAttempts.contentItemId, c.req.param("id")))
    });
    if (!attempt) return c.json({ error: "Quiz attempt not found" }, 404);
    if (attempt.status !== "in_progress") return c.json({ error: "Quiz attempt is already submitted" }, 409);
    const questions = await db.query.quizAttemptQuestions.findMany({ where: eq(quizAttemptQuestions.attemptId, attempt.id) });
    const questionsById = new Map(questions.map((question) => [question.id, question]));
    if (new Set(parsed.data.answers.map((answer) => answer.questionId)).size !== parsed.data.answers.length || parsed.data.answers.some((answer) => !questionsById.has(answer.questionId))) {
      return c.json({ error: "Quiz answer does not belong to this attempt" }, 400);
    }
    const now = new Date();
    for (const answer of parsed.data.answers) {
      const question = questionsById.get(answer.questionId)!;
      const validOptionIds = new Set(question.optionsSnapshot.map((option) => option.id));
      if (answer.selectedOptionIds.some((optionId) => !validOptionIds.has(optionId)) || (question.type === "single_choice" && answer.selectedOptionIds.length > 1) || (question.type === "free_text" && answer.selectedOptionIds.length)) {
        return c.json({ error: "Invalid quiz draft answer" }, 400);
      }
      await db.insert(quizAnswers).values({
        attemptId: attempt.id, questionSnapshotId: answer.questionId, selectedOptionIds: answer.selectedOptionIds,
        text: answer.text, savedAt: now, createdAt: now, updatedAt: now
      }).onConflictDoUpdate({
        target: [quizAnswers.attemptId, quizAnswers.questionSnapshotId],
        set: { selectedOptionIds: answer.selectedOptionIds, text: answer.text, savedAt: now, updatedAt: now }
      });
    }
    return c.json({ ok: true });
  })
  .post("/items/:id/quiz/:attemptId/submit", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const parsed = quizSubmissionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid quiz submission", details: parsed.error.flatten() }, 400);
    const attempt = await db.query.quizAttempts.findFirst({
      where: and(eq(quizAttempts.id, c.req.param("attemptId")), eq(quizAttempts.userId, userId), eq(quizAttempts.contentItemId, c.req.param("id")))
    });
    if (!attempt) return c.json({ error: "Quiz attempt not found" }, 404);
    if (attempt.submissionKey === parsed.data.submissionKey && attempt.status !== "in_progress") {
      return c.json({ ok: true, result: { status: attempt.status, earnedPoints: attempt.earnedPoints, maxPoints: attempt.maxPoints, percent: attempt.percent } });
    }
    if (attempt.status !== "in_progress") return c.json({ error: "Quiz attempt is already submitted" }, 409);

    const revision = await db.query.lessonAssessmentRevisions.findFirst({ where: eq(lessonAssessmentRevisions.id, attempt.revisionId) });
    if (!revision?.passingPercent) return c.json({ error: "Quiz revision not found" }, 409);
    const questions = await db.select().from(quizAttemptQuestions)
      .where(eq(quizAttemptQuestions.attemptId, attempt.id)).orderBy(asc(quizAttemptQuestions.sortOrder));
    const questionsById = new Map(questions.map((question) => [question.id, question]));
    if (new Set(parsed.data.answers.map((answer) => answer.questionId)).size !== parsed.data.answers.length ||
        parsed.data.answers.some((answer) => !questionsById.has(answer.questionId))) {
      return c.json({ error: "Quiz answer does not belong to this attempt" }, 400);
    }
    for (const answer of parsed.data.answers) {
      const question = questionsById.get(answer.questionId)!;
      const validOptionIds = new Set(question.optionsSnapshot.map((option) => option.id));
      if (answer.selectedOptionIds.some((optionId) => !validOptionIds.has(optionId)) ||
          (question.type === "single_choice" && answer.selectedOptionIds.length > 1) ||
          (question.type === "free_text" && answer.selectedOptionIds.length > 0)) {
        return c.json({ error: "Invalid quiz answer" }, 400);
      }
    }
    const score = scoreQuizAttempt({
      passingPercent: revision.passingPercent,
      questions: questions.map((question) => ({ id: question.id, type: question.type as "single_choice" | "multiple_choice" | "free_text", points: question.points, correctOptionIds: question.correctOptionIds }))
    }, parsed.data.answers);
    const now = new Date();
    const claimed = await db.transaction(async (tx) => {
      const [claimedAttempt] = await tx.update(quizAttempts).set({
        status: score.status,
        earnedPoints: score.earnedPoints,
        maxPoints: score.maxPoints,
        percent: score.percent,
        submissionKey: parsed.data.submissionKey,
        submittedAt: now,
        updatedAt: now
      }).where(and(eq(quizAttempts.id, attempt.id), eq(quizAttempts.status, "in_progress"))).returning({ id: quizAttempts.id });
      if (!claimedAttempt) return false;
      if (parsed.data.answers.length) {
        for (const answer of parsed.data.answers) {
          await tx.insert(quizAnswers).values({
            attemptId: attempt.id, questionSnapshotId: answer.questionId, selectedOptionIds: answer.selectedOptionIds,
            text: answer.text, savedAt: now, createdAt: now, updatedAt: now
          }).onConflictDoUpdate({
            target: [quizAnswers.attemptId, quizAnswers.questionSnapshotId],
            set: { selectedOptionIds: answer.selectedOptionIds, text: answer.text, savedAt: now, updatedAt: now }
          });
        }
      }
      if (score.status === "passed") {
        await tx.insert(userContentProgress).values({ userId, contentItemId: attempt.contentItemId, lastOpenedAt: now, completedAt: now, updatedAt: now })
          .onConflictDoUpdate({ target: [userContentProgress.userId, userContentProgress.contentItemId], set: { completedAt: now, updatedAt: now } });
      }
      return true;
    });
    if (!claimed) {
      const submitted = await db.query.quizAttempts.findFirst({ where: eq(quizAttempts.id, attempt.id) });
      if (submitted?.submissionKey === parsed.data.submissionKey) {
        return c.json({ ok: true, result: { status: submitted.status, earnedPoints: submitted.earnedPoints, maxPoints: submitted.maxPoints, percent: submitted.percent } });
      }
      return c.json({ error: "Quiz attempt is already submitted" }, 409);
    }
    return c.json({ ok: true, result: score });
  })
  .post("/items/:id/complete", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const item = await db.query.contentItems.findFirst({
      where: and(eq(contentItems.id, c.req.param("id")), publishedContentWhere())
    });

    if (!item) {
      return c.json({ error: "Learning content not found" }, 404);
    }

    if (item.assessmentMode === "quiz") {
      const passed = await db.query.quizAttempts.findFirst({
        where: and(eq(quizAttempts.userId, userId), eq(quizAttempts.contentItemId, item.id), eq(quizAttempts.status, "passed"))
      });
      if (!passed) return c.json({ error: "Complete the quiz before finishing the lesson" }, 409);
    }
    if (item.assessmentMode === "homework") {
      const accepted = await db.query.homeworkSubmissions.findFirst({
        where: and(eq(homeworkSubmissions.userId, userId), eq(homeworkSubmissions.contentItemId, item.id), eq(homeworkSubmissions.status, "accepted"))
      });
      if (!accepted) return c.json({ error: "Submit an accepted homework before finishing the lesson" }, 409);
    }

    const now = new Date();
    const [progress] = await db
      .insert(userContentProgress)
      .values({
        userId,
        contentItemId: item.id,
        lastOpenedAt: now,
        completedAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: [userContentProgress.userId, userContentProgress.contentItemId],
        set: {
          completedAt: now,
          lastOpenedAt: now,
          updatedAt: now
        }
      })
      .returning();

    return c.json({
      ok: true,
      completedAt: progress?.completedAt?.toISOString() ?? now.toISOString(),
      playbackPositionSeconds: progress?.playbackPositionSeconds ?? 0
    });
  })
  .put("/items/:id/favorite", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const item = await db.query.contentItems.findFirst({
      where: and(eq(contentItems.id, c.req.param("id")), publishedContentWhere())
    });
    if (!item) return c.json({ error: "Learning content not found" }, 404);

    await db
      .insert(userLearningFavorites)
      .values({ userId, contentItemId: item.id })
      .onConflictDoNothing();

    return c.json({ ok: true, favorite: true });
  })
  .delete("/items/:id/favorite", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const item = await db.query.contentItems.findFirst({
      where: and(eq(contentItems.id, c.req.param("id")), publishedContentWhere())
    });
    if (!item) return c.json({ error: "Learning content not found" }, 404);

    await db
      .delete(userLearningFavorites)
      .where(and(eq(userLearningFavorites.userId, userId), eq(userLearningFavorites.contentItemId, item.id)));

    return c.json({ ok: true, favorite: false });
  })
  .get("/items/:id/comments", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const item = await db.query.contentItems.findFirst({
      where: and(eq(contentItems.id, c.req.param("id")), publishedContentWhere())
    });

    if (!item) {
      return c.json({ error: "Learning content not found" }, 404);
    }

    const comments = await db.query.lessonComments.findMany({
      where: and(
        eq(lessonComments.contentItemId, item.id),
        eq(lessonComments.userId, userId),
        eq(lessonComments.status, "visible")
      ),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 50,
      with: {
        user: true
      }
    });

    return c.json({
      comments: comments.map(serializeComment),
      mutedUntil: null,
      mutedPermanently: false
    });
  })
  .post("/items/:id/comments", requireActiveMember, async (c) => {
    const body = commentPayloadSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) {
      return c.json({ error: "Invalid comment" }, 400);
    }

    const item = await db.query.contentItems.findFirst({
      where: and(eq(contentItems.id, c.req.param("id")), publishedContentWhere())
    });

    if (!item) {
      return c.json({ error: "Learning content not found" }, 404);
    }

    const [comment] = await db
      .insert(lessonComments)
      .values({
        contentItemId: item.id,
        userId: c.get("userId"),
        body: body.data.body
      })
      .returning();

    if (!comment) {
      return c.json({ error: "Unable to create comment" }, 500);
    }

    const createdComment = await db.query.lessonComments.findFirst({
      where: eq(lessonComments.id, comment.id),
      with: {
        user: true
      }
    });

    if (!createdComment) {
      return c.json({ error: "Unable to create comment" }, 500);
    }

    return c.json({
      ok: true,
      comment: serializeComment(createdComment)
    });
  });
