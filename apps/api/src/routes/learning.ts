import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { contentCategories, contentItems, lessonComments, lessonMaterials, userContentProgress } from "../db/schema";
import { db } from "../db/client";
import { buildMessageAuthor } from "../community/messageMetadata";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { requireActiveMember } from "../middleware/requireActiveMember";
import { getObjectReadUrl } from "../storage/s3";
import { decodeModuleCategoryDefaultCardLayout, decodeModuleCategoryDescription, isModuleCategoryDescription } from "../learning/moduleCategory";

const commentPayloadSchema = z.object({
  body: z.string().trim().min(1).max(2000)
});

const playbackPayloadSchema = z.object({
  positionSeconds: z.number().int().min(0).max(24 * 60 * 60),
  materialId: z.string().uuid().nullable().optional()
});

function publishedContentWhere() {
  return and(eq(contentItems.isPublished, true), or(isNull(contentItems.archivedUntil), gt(contentItems.archivedUntil, new Date())));
}

async function serializeContentItem(item: typeof contentItems.$inferSelect, includeBody = false) {
  const mediaUrl = item.mediaObjectKey ? await getObjectReadUrl(item.mediaObjectKey) : item.mediaUrl;
  const thumbnailUrl = item.thumbnailObjectKey ? await getObjectReadUrl(item.thumbnailObjectKey) : item.thumbnailUrl;
  const materials = includeBody
    ? await db.query.lessonMaterials.findMany({
        where: eq(lessonMaterials.contentItemId, item.id),
        orderBy: [asc(lessonMaterials.sortOrder), asc(lessonMaterials.createdAt)]
      })
    : [];

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
    cardLayout: item.cardLayout === "horizontal" ? "horizontal" : "vertical",
    mediaContentType: item.mediaContentType,
    mediaSizeBytes: item.mediaSizeBytes,
    materials: await Promise.all(
      materials.map(async (material) => ({
        id: material.id,
        kind: material.kind,
        title: material.title,
        description: material.description,
        body: material.body,
        mediaUrl: material.mediaObjectKey ? await getObjectReadUrl(material.mediaObjectKey) : material.mediaUrl,
        mediaSource: material.mediaObjectKey ? "s3" : material.mediaUrl ? "external" : null,
        mediaContentType: material.mediaContentType,
        mediaSizeBytes: material.mediaSizeBytes
      }))
    ),
    publishedAt: item.publishedAt?.toISOString() ?? null
  };
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
        itemsCount: count(contentItems.id)
      })
      .from(contentCategories)
      .leftJoin(
        contentItems,
        and(eq(contentItems.categoryId, contentCategories.id), publishedContentWhere())
      )
      .where(eq(contentCategories.isPublished, true))
      .groupBy(contentCategories.id)
      .orderBy(contentCategories.sortOrder);

    const categories = rawCategories
      .filter((category) => isModuleCategoryDescription(category.description))
      .map((category) => ({
        ...category,
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

    const [completedItemsRow] = moduleContentWhere
      ? await db
          .select({
            value: count(userContentProgress.id)
          })
          .from(userContentProgress)
          .innerJoin(contentItems, eq(contentItems.id, userContentProgress.contentItemId))
          .where(and(eq(userContentProgress.userId, userId), moduleContentWhere, isNotNull(userContentProgress.completedAt)))
      : [{ value: 0 }];

    const lastOpenedProgress = await db.query.userContentProgress.findFirst({
      where: eq(userContentProgress.userId, userId),
      orderBy: [desc(userContentProgress.lastOpenedAt)],
      with: {
        item: true
      }
    });
    const lastOpenedItem =
      lastOpenedProgress?.item &&
      lastOpenedProgress.item.isPublished &&
      (!lastOpenedProgress.item.archivedUntil || lastOpenedProgress.item.archivedUntil > new Date())
        ? lastOpenedProgress.item
        : null;

    return c.json({
      categories,
      featured: await Promise.all(featured.map((item) => serializeContentItem(item))),
      progress: {
        totalItems: totalItemsRow?.value ?? 0,
        completedItems: completedItemsRow?.value ?? 0,
        lastOpenedItem: lastOpenedItem ? await serializeContentItem(lastOpenedItem, true) : null,
        lastOpenedMaterialId: lastOpenedItem ? lastOpenedProgress?.lastOpenedMaterialId ?? null : null,
        lastOpenedAt: lastOpenedProgress?.lastOpenedAt.toISOString() ?? null,
        lastOpenedPlaybackPositionSeconds: lastOpenedItem ? lastOpenedProgress?.playbackPositionSeconds ?? 0 : 0
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
  .post("/items/:id/complete", requireActiveMember, async (c) => {
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
