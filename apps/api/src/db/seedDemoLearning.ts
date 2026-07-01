import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import sharp from "sharp";
import { and, eq, inArray } from "drizzle-orm";
import type { ContentKind } from "@club/shared";
import { encodeModuleCategoryDescription } from "../learning/moduleCategory";
import { buildLearningMediaObjectKey, buildLearningThumbnailObjectKey } from "../learning/mediaUpload";
import { deleteObject, uploadObject, type S3StorageTarget } from "../storage/s3";
import { db, postgresClient } from "./client";
import { contentCategories, contentItems, lessonMaterials } from "./schema";

type CardLayout = "vertical" | "horizontal";

type UploadedObject = {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
};

const demoCategorySlugs = ["demo-vertical-cards", "demo-horizontal-cards"];
const demoVideoUrl = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const demoModules: Array<{
  slug: string;
  title: string;
  description: string;
  layout: CardLayout;
  sortOrder: number;
}> = [
  {
    slug: "demo-vertical-cards",
    title: "Демо: вертикальные карточки",
    description: "Примеры карточек с видео, фото, аудио и смешанным уроком.",
    layout: "vertical",
    sortOrder: 90
  },
  {
    slug: "demo-horizontal-cards",
    title: "Демо: горизонтальные карточки",
    description: "Такие же материалы в горизонтальном формате карточек.",
    layout: "horizontal",
    sortOrder: 91
  }
];

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function createDemoImage({
  title,
  subtitle,
  layout,
  tone
}: {
  title: string;
  subtitle: string;
  layout: CardLayout;
  tone: "blue" | "green" | "rose" | "amber";
}) {
  const size = layout === "horizontal" ? { width: 1280, height: 720 } : { width: 900, height: 1200 };
  const palettes = {
    blue: ["#0f6aa6", "#3ec5ff", "#07203a"],
    green: ["#0f6b55", "#63d6a4", "#071f1a"],
    rose: ["#842954", "#ff8eb6", "#24101b"],
    amber: ["#7a4b08", "#ffd166", "#261703"]
  } as const;
  const [start, end, dark] = palettes[tone];
  const titleSize = layout === "horizontal" ? 82 : 76;
  const subtitleSize = layout === "horizontal" ? 34 : 32;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${start}"/>
          <stop offset="0.55" stop-color="${end}"/>
          <stop offset="1" stop-color="${dark}"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="36%" r="55%">
          <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <circle cx="${size.width * 0.78}" cy="${size.height * 0.22}" r="${size.width * 0.2}" fill="url(#glow)"/>
      <circle cx="${size.width * 0.22}" cy="${size.height * 0.78}" r="${size.width * 0.18}" fill="#ffffff" opacity="0.12"/>
      <rect x="${size.width * 0.08}" y="${size.height * 0.1}" width="${size.width * 0.84}" height="${size.height * 0.8}" rx="48" fill="#08111f" opacity="0.28" stroke="#ffffff" stroke-opacity="0.32" stroke-width="3"/>
      <text x="${size.width * 0.13}" y="${size.height * 0.44}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="800">${escapeXml(title)}</text>
      <text x="${size.width * 0.13}" y="${size.height * 0.44 + 58}" fill="#eaf6ff" font-family="Arial, sans-serif" font-size="${subtitleSize}" font-weight="600">${escapeXml(subtitle)}</text>
      <text x="${size.width * 0.13}" y="${size.height * 0.44 + 128}" fill="#ffffff" opacity="0.82" font-family="Arial, sans-serif" font-size="28">tehnobot_club demo</text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

function createDemoWav(durationSeconds = 8) {
  const sampleRate = 44_100;
  const samples = Math.floor(sampleRate * durationSeconds);
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < samples; index += 1) {
    const time = index / sampleRate;
    const fadeIn = Math.min(1, time / 0.25);
    const fadeOut = Math.min(1, (durationSeconds - time) / 0.35);
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
    const primary = Math.sin(2 * Math.PI * 440 * time);
    const secondary = Math.sin(2 * Math.PI * 660 * time) * 0.35;
    const value = Math.floor((primary + secondary) * 12_000 * envelope);
    buffer.writeInt16LE(value, 44 + index * 2);
  }

  return buffer;
}

async function fetchDemoVideo() {
  const response = await fetch(demoVideoUrl);
  if (!response.ok) {
    throw new Error(`Unable to download demo video: ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength <= 0 || bytes.byteLength > 50 * 1024 * 1024) {
    throw new Error("Demo video size is invalid");
  }

  return bytes;
}

async function uploadDemoMedia(kind: ContentKind, fileName: string, contentType: string, body: Buffer) {
  const now = new Date();
  const key = buildLearningMediaObjectKey({ kind, fileName, id: randomUUID(), now });
  const upload = await uploadObject({ key, body, contentType });
  return {
    objectKey: upload.key,
    contentType,
    sizeBytes: body.byteLength
  };
}

async function uploadDemoThumbnail(fileName: string, body: Buffer) {
  const now = new Date();
  const key = buildLearningThumbnailObjectKey({ fileName, id: randomUUID(), now });
  const upload = await uploadObject({ key, body, contentType: "image/png" });
  return {
    objectKey: upload.key,
    contentType: "image/png",
    sizeBytes: body.byteLength
  };
}

async function deleteExistingDemoObjects() {
  const categories = await db.query.contentCategories.findMany({
    where: inArray(contentCategories.slug, demoCategorySlugs)
  });
  const categoryIds = categories.map((category) => category.id);
  if (!categoryIds.length) {
    return;
  }

  const items = await db.query.contentItems.findMany({
    where: inArray(contentItems.categoryId, categoryIds)
  });
  const itemIds = items.map((item) => item.id);
  const materials = itemIds.length
    ? await db.query.lessonMaterials.findMany({
        where: inArray(lessonMaterials.contentItemId, itemIds)
      })
    : [];

  const keys = new Set<string>();
  for (const item of items) {
    if (item.mediaObjectKey) {
      keys.add(item.mediaObjectKey);
    }
    if (item.thumbnailObjectKey) {
      keys.add(item.thumbnailObjectKey);
    }
  }
  for (const material of materials) {
    if (material.mediaObjectKey) {
      keys.add(material.mediaObjectKey);
    }
  }

  for (const key of keys) {
    for (const target of ["primary", "reserve"] satisfies S3StorageTarget[]) {
      await deleteObject(key, target).catch(() => null);
    }
  }

  await db.delete(contentCategories).where(inArray(contentCategories.slug, demoCategorySlugs));
}

async function createDemoItems({
  categoryId,
  layout,
  assets
}: {
  categoryId: string;
  layout: CardLayout;
  assets: {
    video: UploadedObject;
    audio: UploadedObject;
    photo: UploadedObject;
    videoThumb: UploadedObject;
    photoThumb: UploadedObject;
    audioThumb: UploadedObject;
    allThumb: UploadedObject;
  };
}) {
  const now = new Date();
  const cards = [
    {
      kind: "video" as const,
      title: "Видео: короткий фрагмент",
      summary: "Демо-карточка с видеоматериалом.",
      body: "Небольшой видеоролик для проверки запуска, паузы и продолжения просмотра.",
      media: assets.video,
      thumbnail: assets.videoThumb
    },
    {
      kind: "photo" as const,
      title: "Фото: визуальная карточка",
      summary: "Демо-карточка с изображением.",
      body: "Пример урока, где основным материалом является фото.",
      media: assets.photo,
      thumbnail: assets.photoThumb
    },
    {
      kind: "audio" as const,
      title: "Аудио: короткая практика",
      summary: "Демо-карточка с аудиоматериалом.",
      body: "Короткий аудиофайл для проверки проигрывания и продолжения с последнего места.",
      media: assets.audio,
      thumbnail: assets.audioThumb
    },
    {
      kind: "text" as const,
      title: "Всё вместе: мини-урок",
      summary: "Текст, фото, видео и аудио внутри одной карточки.",
      body: "Это смешанный демо-урок: сначала короткий текст, ниже дополнительные материалы всех типов.",
      media: null,
      thumbnail: assets.allThumb
    }
  ];

  for (const [index, card] of cards.entries()) {
    const [item] = await db
      .insert(contentItems)
      .values({
        categoryId,
        kind: card.kind,
        title: card.title,
        summary: card.summary,
        body: card.body,
        mediaObjectKey: card.media?.objectKey ?? null,
        mediaContentType: card.media?.contentType ?? null,
        mediaSizeBytes: card.media?.sizeBytes ?? null,
        thumbnailObjectKey: card.thumbnail.objectKey,
        thumbnailContentType: card.thumbnail.contentType,
        thumbnailSizeBytes: card.thumbnail.sizeBytes,
        cardLayout: layout,
        sortOrder: index,
        isPublished: true,
        publishedAt: now,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    if (!item || card.title !== "Всё вместе: мини-урок") {
      continue;
    }

    await db.insert(lessonMaterials).values([
      {
        contentItemId: item.id,
        kind: "text",
        title: "Текстовый блок",
        description: "Краткое вступление",
        body: "Здесь можно размещать пояснения, задания, ссылки и любые инструкции для клиента.",
        sortOrder: 0,
        createdAt: now,
        updatedAt: now
      },
      {
        contentItemId: item.id,
        kind: "photo",
        title: "Фото внутри урока",
        description: "Дополнительное изображение",
        body: "Фото отображается отдельным материалом внутри карточки.",
        mediaObjectKey: assets.photo.objectKey,
        mediaContentType: assets.photo.contentType,
        mediaSizeBytes: assets.photo.sizeBytes,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now
      },
      {
        contentItemId: item.id,
        kind: "video",
        title: "Видео внутри урока",
        description: "Дополнительный ролик",
        body: "Видео можно смотреть прямо внутри урока.",
        mediaObjectKey: assets.video.objectKey,
        mediaContentType: assets.video.contentType,
        mediaSizeBytes: assets.video.sizeBytes,
        sortOrder: 2,
        createdAt: now,
        updatedAt: now
      },
      {
        contentItemId: item.id,
        kind: "audio",
        title: "Аудио внутри урока",
        description: "Дополнительная дорожка",
        body: "Аудио открывается отдельным плеером.",
        mediaObjectKey: assets.audio.objectKey,
        mediaContentType: assets.audio.contentType,
        mediaSizeBytes: assets.audio.sizeBytes,
        sortOrder: 3,
        createdAt: now,
        updatedAt: now
      }
    ]);
  }
}

async function main() {
  await deleteExistingDemoObjects();

  const [videoBytes, verticalPhoto, horizontalPhoto, verticalVideoThumb, horizontalVideoThumb, verticalAudioThumb, horizontalAudioThumb, verticalAllThumb, horizontalAllThumb] =
    await Promise.all([
      fetchDemoVideo(),
      createDemoImage({ title: "Фото", subtitle: "визуальный урок", layout: "vertical", tone: "green" }),
      createDemoImage({ title: "Фото", subtitle: "визуальный урок", layout: "horizontal", tone: "green" }),
      createDemoImage({ title: "Видео", subtitle: "короткий фрагмент", layout: "vertical", tone: "blue" }),
      createDemoImage({ title: "Видео", subtitle: "короткий фрагмент", layout: "horizontal", tone: "blue" }),
      createDemoImage({ title: "Аудио", subtitle: "короткая практика", layout: "vertical", tone: "rose" }),
      createDemoImage({ title: "Аудио", subtitle: "короткая практика", layout: "horizontal", tone: "rose" }),
      createDemoImage({ title: "Всё вместе", subtitle: "текст + медиа", layout: "vertical", tone: "amber" }),
      createDemoImage({ title: "Всё вместе", subtitle: "текст + медиа", layout: "horizontal", tone: "amber" })
    ]);

  const audioBytes = createDemoWav();
  const [
    video,
    audio,
    verticalPhotoMedia,
    horizontalPhotoMedia,
    verticalPhotoThumbMedia,
    horizontalPhotoThumbMedia,
    verticalVideoThumbMedia,
    horizontalVideoThumbMedia,
    verticalAudioThumbMedia,
    horizontalAudioThumbMedia,
    verticalAllThumbMedia,
    horizontalAllThumbMedia
  ] =
    await Promise.all([
      uploadDemoMedia("video", "demo-video.mp4", "video/mp4", videoBytes),
      uploadDemoMedia("audio", "demo-audio.wav", "audio/wav", audioBytes),
      uploadDemoMedia("photo", "demo-photo-vertical.png", "image/png", verticalPhoto),
      uploadDemoMedia("photo", "demo-photo-horizontal.png", "image/png", horizontalPhoto),
      uploadDemoThumbnail("demo-photo-vertical.png", verticalPhoto),
      uploadDemoThumbnail("demo-photo-horizontal.png", horizontalPhoto),
      uploadDemoThumbnail("demo-video-vertical.png", verticalVideoThumb),
      uploadDemoThumbnail("demo-video-horizontal.png", horizontalVideoThumb),
      uploadDemoThumbnail("demo-audio-vertical.png", verticalAudioThumb),
      uploadDemoThumbnail("demo-audio-horizontal.png", horizontalAudioThumb),
      uploadDemoThumbnail("demo-all-vertical.png", verticalAllThumb),
      uploadDemoThumbnail("demo-all-horizontal.png", horizontalAllThumb)
    ]);

  for (const module of demoModules) {
    const [category] = await db
      .insert(contentCategories)
      .values({
        slug: module.slug,
        title: module.title,
        description: encodeModuleCategoryDescription(module.description, module.layout),
        sortOrder: module.sortOrder,
        isPublished: true,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    if (!category) {
      throw new Error(`Unable to create demo category ${module.slug}`);
    }

    await createDemoItems({
      categoryId: category.id,
      layout: module.layout,
      assets:
        module.layout === "horizontal"
          ? {
              video,
              audio,
              photo: horizontalPhotoMedia,
              videoThumb: horizontalVideoThumbMedia,
              photoThumb: horizontalPhotoThumbMedia,
              audioThumb: horizontalAudioThumbMedia,
              allThumb: horizontalAllThumbMedia
            }
          : {
              video,
              audio,
              photo: verticalPhotoMedia,
              videoThumb: verticalVideoThumbMedia,
              photoThumb: verticalPhotoThumbMedia,
              audioThumb: verticalAudioThumbMedia,
              allThumb: verticalAllThumbMedia
            }
    });
  }

  const summary = await db
    .select({
      categoryId: contentCategories.id,
      slug: contentCategories.slug,
      title: contentCategories.title
    })
    .from(contentCategories)
    .where(inArray(contentCategories.slug, demoCategorySlugs));

  const itemCounts = await Promise.all(
    summary.map(async (category) => {
      const items = await db.query.contentItems.findMany({
        where: and(eq(contentItems.categoryId, category.categoryId), eq(contentItems.isPublished, true))
      });
      return `${category.title}: ${items.length}`;
    })
  );

  console.log(`Demo learning content created: ${itemCounts.join("; ")}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await postgresClient.end({ timeout: 5 });
  });
