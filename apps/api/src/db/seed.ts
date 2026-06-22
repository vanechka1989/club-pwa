import { count, eq } from "drizzle-orm";
import { db, postgresClient } from "./client";
import { contentCategories, contentItems } from "./schema";

const now = new Date();

const categories = [
  {
    slug: "start",
    title: "Старт",
    description: "Первые материалы для новых участников клуба.",
    sortOrder: 10
  },
  {
    slug: "training",
    title: "Обучение",
    description: "Основные уроки, разборы и практические материалы.",
    sortOrder: 20
  },
  {
    slug: "media",
    title: "Фото и видео",
    description: "Визуальные материалы, записи и дополнительные медиа.",
    sortOrder: 30
  }
] as const;

async function seed() {
  const createdCategories = [];

  for (const category of categories) {
    const [created] = await db
      .insert(contentCategories)
      .values({
        ...category,
        isPublished: true
      })
      .onConflictDoUpdate({
        target: contentCategories.slug,
        set: {
          title: category.title,
          description: category.description,
          sortOrder: category.sortOrder,
          isPublished: true,
          updatedAt: now
        }
      })
      .returning();

    if (created) {
      createdCategories.push(created);
    }
  }

  const trainingCategory = createdCategories.find((category) => category.slug === "training");
  if (!trainingCategory) {
    throw new Error("Training category was not created");
  }

  const [itemsCount] = await db
    .select({ value: count() })
    .from(contentItems)
    .where(eq(contentItems.categoryId, trainingCategory.id));

  if ((itemsCount?.value ?? 0) === 0) {
    await db.insert(contentItems).values([
      {
        categoryId: trainingCategory.id,
        kind: "text",
        title: "Первый закрытый материал",
        summary: "Пример текстового урока для локальной разработки.",
        body: "Здесь будет основной текст материала клуба.",
        sortOrder: 10,
        isPublished: true,
        publishedAt: now
      },
      {
        categoryId: trainingCategory.id,
        kind: "photo",
        title: "Фото-материал",
        summary: "Пример материала с изображением.",
        mediaUrl: "https://placehold.co/1200x800",
        sortOrder: 20,
        isPublished: true,
        publishedAt: now
      },
      {
        categoryId: trainingCategory.id,
        kind: "video",
        title: "Видео-урок",
        summary: "Пример видео-материала.",
        mediaUrl: "https://example.com/video.mp4",
        sortOrder: 30,
        isPublished: true,
        publishedAt: now
      }
    ]);
  }
}

try {
  await seed();
  console.log("Seed data is ready.");
} finally {
  await postgresClient.end();
}
