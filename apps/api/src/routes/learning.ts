import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { contentCategories, contentItems, userContentProgress } from "../db/schema";
import { db } from "../db/client";
import type { AuthVariables } from "../middleware/auth";
import { telegramAuth } from "../middleware/auth";
import { requireActiveMember } from "../middleware/requireActiveMember";

function serializeContentItem(item: typeof contentItems.$inferSelect, includeBody = false) {
  return {
    id: item.id,
    categoryId: item.categoryId,
    kind: item.kind,
    title: item.title,
    summary: item.summary,
    body: includeBody ? item.body : null,
    mediaUrl: item.mediaUrl,
    publishedAt: item.publishedAt?.toISOString() ?? null
  };
}

export const learningRoute = new Hono<{ Variables: AuthVariables }>()
  .use("*", telegramAuth)
  .get("/", async (c) => {
    const userId = c.get("userId");
    const categories = await db
      .select({
        id: contentCategories.id,
        slug: contentCategories.slug,
        title: contentCategories.title,
        description: contentCategories.description,
        itemsCount: count(contentItems.id)
      })
      .from(contentCategories)
      .leftJoin(
        contentItems,
        and(eq(contentItems.categoryId, contentCategories.id), eq(contentItems.isPublished, true))
      )
      .where(eq(contentCategories.isPublished, true))
      .groupBy(contentCategories.id)
      .orderBy(contentCategories.sortOrder);

    const featured = await db.query.contentItems.findMany({
      where: eq(contentItems.isPublished, true),
      orderBy: [desc(contentItems.publishedAt)],
      limit: 6
    });

    const [totalItemsRow] = await db
      .select({
        value: count(contentItems.id)
      })
      .from(contentItems)
      .where(eq(contentItems.isPublished, true));

    const [completedItemsRow] = await db
      .select({
        value: count(userContentProgress.id)
      })
      .from(userContentProgress)
      .innerJoin(contentItems, eq(contentItems.id, userContentProgress.contentItemId))
      .where(
        and(
          eq(userContentProgress.userId, userId),
          eq(contentItems.isPublished, true),
          isNotNull(userContentProgress.completedAt)
        )
      );

    const lastOpenedProgress = await db.query.userContentProgress.findFirst({
      where: eq(userContentProgress.userId, userId),
      orderBy: [desc(userContentProgress.lastOpenedAt)],
      with: {
        item: true
      }
    });

    return c.json({
      categories,
      featured: featured.map((item) => serializeContentItem(item)),
      progress: {
        totalItems: totalItemsRow?.value ?? 0,
        completedItems: completedItemsRow?.value ?? 0,
        lastOpenedItem: lastOpenedProgress?.item ? serializeContentItem(lastOpenedProgress.item) : null,
        lastOpenedAt: lastOpenedProgress?.lastOpenedAt.toISOString() ?? null
      }
    });
  })
  .get("/items/:id", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const item = await db.query.contentItems.findFirst({
      where: and(eq(contentItems.id, c.req.param("id")), eq(contentItems.isPublished, true))
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
      item: serializeContentItem(item, true),
      completedAt: progress?.completedAt?.toISOString() ?? null
    });
  })
  .post("/items/:id/complete", requireActiveMember, async (c) => {
    const userId = c.get("userId");
    const item = await db.query.contentItems.findFirst({
      where: and(eq(contentItems.id, c.req.param("id")), eq(contentItems.isPublished, true))
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
      completedAt: progress?.completedAt?.toISOString() ?? now.toISOString()
    });
  });
