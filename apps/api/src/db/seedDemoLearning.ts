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

type DemoImageVariant = "video" | "photo" | "audio" | "all";

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
    description: "Витрина клуба: видео, фото, аудио и смешанный урок в вертикальных карточках.",
    layout: "vertical",
    sortOrder: 90
  },
  {
    slug: "demo-horizontal-cards",
    title: "Демо: горизонтальные карточки",
    description: "Та же клубная витрина, но в горизонтальном формате карточек.",
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
  variant
}: {
  title: string;
  subtitle: string;
  layout: CardLayout;
  variant: DemoImageVariant;
}) {
  const size = layout === "horizontal" ? { width: 1280, height: 720 } : { width: 900, height: 1200 };
  const themes = {
    video: ["#071427", "#0a7fc2", "#54d8ff", "#102642"],
    photo: ["#081b22", "#0d8d75", "#7af0c5", "#12342e"],
    audio: ["#170b27", "#8f3bb5", "#ff8bd1", "#2b143c"],
    all: ["#211003", "#ce6b1e", "#ffd166", "#35200c"]
  } as const;
  const [dark, start, accent, panel] = themes[variant];
  const titleSize = layout === "horizontal" ? 70 : 62;
  const subtitleSize = layout === "horizontal" ? 34 : 32;
  const phoneX = layout === "horizontal" ? size.width * 0.62 : size.width * 0.2;
  const phoneY = layout === "horizontal" ? size.height * 0.13 : size.height * 0.24;
  const phoneW = layout === "horizontal" ? size.width * 0.24 : size.width * 0.6;
  const phoneH = layout === "horizontal" ? size.height * 0.72 : size.height * 0.48;
  const titleX = layout === "horizontal" ? size.width * 0.08 : size.width * 0.1;
  const titleY = layout === "horizontal" ? size.height * 0.38 : size.height * 0.79;

  const variantArt = {
    video: `
      <rect x="${phoneX}" y="${phoneY}" width="${phoneW}" height="${phoneH}" rx="42" fill="#07111f" stroke="#ffffff" stroke-opacity="0.28" stroke-width="3"/>
      <rect x="${phoneX + phoneW * 0.1}" y="${phoneY + phoneH * 0.12}" width="${phoneW * 0.8}" height="${phoneH * 0.44}" rx="28" fill="${panel}"/>
      <circle cx="${phoneX + phoneW * 0.5}" cy="${phoneY + phoneH * 0.34}" r="${phoneW * 0.13}" fill="#ffffff" opacity="0.92"/>
      <path d="M ${phoneX + phoneW * 0.47} ${phoneY + phoneH * 0.28} L ${phoneX + phoneW * 0.47} ${phoneY + phoneH * 0.4} L ${phoneX + phoneW * 0.58} ${phoneY + phoneH * 0.34} Z" fill="${start}"/>
      <rect x="${phoneX + phoneW * 0.1}" y="${phoneY + phoneH * 0.64}" width="${phoneW * 0.8}" height="${phoneH * 0.08}" rx="18" fill="#ffffff" opacity="0.16"/>
      <rect x="${phoneX + phoneW * 0.1}" y="${phoneY + phoneH * 0.77}" width="${phoneW * 0.55}" height="${phoneH * 0.06}" rx="16" fill="#ffffff" opacity="0.12"/>
    `,
    photo: `
      <rect x="${phoneX}" y="${phoneY}" width="${phoneW}" height="${phoneH}" rx="42" fill="#061814" stroke="#ffffff" stroke-opacity="0.3" stroke-width="3"/>
      <circle cx="${phoneX + phoneW * 0.28}" cy="${phoneY + phoneH * 0.28}" r="${phoneW * 0.12}" fill="#d9fff0"/>
      <circle cx="${phoneX + phoneW * 0.52}" cy="${phoneY + phoneH * 0.25}" r="${phoneW * 0.1}" fill="#a6f7d8"/>
      <circle cx="${phoneX + phoneW * 0.72}" cy="${phoneY + phoneH * 0.31}" r="${phoneW * 0.12}" fill="#ffffff"/>
      <rect x="${phoneX + phoneW * 0.13}" y="${phoneY + phoneH * 0.49}" width="${phoneW * 0.32}" height="${phoneH * 0.26}" rx="22" fill="${panel}"/>
      <rect x="${phoneX + phoneW * 0.53}" y="${phoneY + phoneH * 0.49}" width="${phoneW * 0.32}" height="${phoneH * 0.26}" rx="22" fill="${start}" opacity="0.8"/>
      <path d="M ${phoneX + phoneW * 0.16} ${phoneY + phoneH * 0.71} L ${phoneX + phoneW * 0.28} ${phoneY + phoneH * 0.58} L ${phoneX + phoneW * 0.42} ${phoneY + phoneH * 0.71} Z" fill="${accent}" opacity="0.8"/>
    `,
    audio: `
      <rect x="${phoneX}" y="${phoneY}" width="${phoneW}" height="${phoneH}" rx="42" fill="#120a20" stroke="#ffffff" stroke-opacity="0.28" stroke-width="3"/>
      <circle cx="${phoneX + phoneW * 0.5}" cy="${phoneY + phoneH * 0.34}" r="${phoneW * 0.22}" fill="${panel}"/>
      <circle cx="${phoneX + phoneW * 0.5}" cy="${phoneY + phoneH * 0.34}" r="${phoneW * 0.1}" fill="#ffffff" opacity="0.9"/>
      ${Array.from({ length: 13 }, (_, index) => {
        const x = phoneX + phoneW * (0.16 + index * 0.057);
        const h = phoneH * (0.12 + (index % 4) * 0.035);
        return `<rect x="${x}" y="${phoneY + phoneH * 0.67 - h / 2}" width="${phoneW * 0.026}" height="${h}" rx="9" fill="${accent}" opacity="${0.45 + (index % 3) * 0.18}"/>`;
      }).join("")}
    `,
    all: `
      <rect x="${phoneX}" y="${phoneY}" width="${phoneW}" height="${phoneH}" rx="42" fill="#1a1006" stroke="#ffffff" stroke-opacity="0.3" stroke-width="3"/>
      <rect x="${phoneX + phoneW * 0.11}" y="${phoneY + phoneH * 0.13}" width="${phoneW * 0.78}" height="${phoneH * 0.18}" rx="22" fill="${panel}"/>
      <rect x="${phoneX + phoneW * 0.11}" y="${phoneY + phoneH * 0.38}" width="${phoneW * 0.34}" height="${phoneH * 0.22}" rx="22" fill="${start}" opacity="0.88"/>
      <rect x="${phoneX + phoneW * 0.55}" y="${phoneY + phoneH * 0.38}" width="${phoneW * 0.34}" height="${phoneH * 0.22}" rx="22" fill="${accent}" opacity="0.78"/>
      <rect x="${phoneX + phoneW * 0.11}" y="${phoneY + phoneH * 0.68}" width="${phoneW * 0.78}" height="${phoneH * 0.13}" rx="22" fill="#ffffff" opacity="0.14"/>
      <circle cx="${phoneX + phoneW * 0.72}" cy="${phoneY + phoneH * 0.49}" r="${phoneW * 0.055}" fill="#ffffff" opacity="0.9"/>
      <path d="M ${phoneX + phoneW * 0.7} ${phoneY + phoneH * 0.45} L ${phoneX + phoneW * 0.7} ${phoneY + phoneH * 0.53} L ${phoneX + phoneW * 0.77} ${phoneY + phoneH * 0.49} Z" fill="${start}"/>
    `
  }[variant];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${dark}"/>
          <stop offset="0.56" stop-color="${start}"/>
          <stop offset="1" stop-color="#050712"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="36%" r="55%">
          <stop offset="0" stop-color="${accent}" stop-opacity="0.72"/>
          <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="28" stdDeviation="28" flood-color="#000000" flood-opacity="0.36"/>
        </filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <circle cx="${size.width * 0.78}" cy="${size.height * 0.2}" r="${size.width * 0.24}" fill="url(#glow)"/>
      <circle cx="${size.width * 0.12}" cy="${size.height * 0.2}" r="${size.width * 0.16}" fill="#ffffff" opacity="0.08"/>
      <g opacity="0.22">
        ${Array.from({ length: 9 }, (_, row) =>
          Array.from({ length: 12 }, (_, col) => `<circle cx="${size.width * (0.06 + col * 0.08)}" cy="${size.height * (0.08 + row * 0.08)}" r="2.2" fill="#ffffff"/>`).join("")
        ).join("")}
      </g>
      <g filter="url(#shadow)">${variantArt}</g>
      <text x="${titleX}" y="${titleY}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="800">${escapeXml(title)}</text>
      <text x="${titleX}" y="${titleY + 52}" fill="#eaf6ff" font-family="Arial, sans-serif" font-size="${subtitleSize}" font-weight="600">${escapeXml(subtitle)}</text>
      <text x="${titleX}" y="${titleY + 104}" fill="#ffffff" opacity="0.76" font-family="Arial, sans-serif" font-size="26">tehnobot_club</text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

function createDemoWav(durationSeconds = 18) {
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

  const midiToFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
  const melody = [72, 76, 79, 83, 81, 79, 76, 74, 72, 76, 79, 84, 83, 79, 76, 72];
  const chords = [
    [48, 52, 55, 59],
    [45, 48, 52, 55],
    [53, 57, 60, 64],
    [55, 59, 62, 65]
  ];
  const noteLength = 0.5;
  const chordLength = 2;

  for (let index = 0; index < samples; index += 1) {
    const time = index / sampleRate;
    const masterFade = Math.max(0, Math.min(1, time / 0.7, (durationSeconds - time) / 1.1));
    const melodyIndex = Math.floor(time / noteLength) % melody.length;
    const noteTime = time % noteLength;
    const noteEnv = Math.max(0, Math.min(1, noteTime / 0.05, (noteLength - noteTime) / 0.14));
    const noteFreq = midiToFrequency(melody[melodyIndex] ?? 72);
    const lead = (Math.sin(2 * Math.PI * noteFreq * time) + Math.sin(2 * Math.PI * noteFreq * 2 * time) * 0.18) * noteEnv;

    const chord = chords[Math.floor(time / chordLength) % chords.length] ?? chords[0] ?? [48, 52, 55, 59];
    const pad = chord.reduce((sum, midi, chordIndex) => {
      const freq = midiToFrequency(midi);
      return sum + Math.sin(2 * Math.PI * freq * time + chordIndex * 0.35) * 0.18;
    }, 0);

    const bassFreq = midiToFrequency(chord[0] ?? 48) / 2;
    const bass = Math.sin(2 * Math.PI * bassFreq * time) * 0.22;
    const value = Math.floor((lead * 0.62 + pad * 0.34 + bass) * 11_000 * masterFade);
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
      title: "Видео: знакомство с клубом",
      summary: "Короткий ролик для первого экрана обучения.",
      body: "Покажите клиенту, как может выглядеть вводный видеоурок: быстрый старт, понятный сценарий и удобное продолжение просмотра с последнего места.",
      media: assets.video,
      thumbnail: assets.videoThumb
    },
    {
      kind: "photo" as const,
      title: "Фото: атмосфера сообщества",
      summary: "Визуальная карточка для клуба, команды или мероприятия.",
      body: "Такой формат подходит для галерей, примеров работ, афиш, референсов и визуальных материалов внутри закрытого клуба.",
      media: assets.photo,
      thumbnail: assets.photoThumb
    },
    {
      kind: "audio" as const,
      title: "Аудио: приветствие клуба",
      summary: "Небольшая мелодия для проверки аудиоплеера.",
      body: "Пример аудиоурока: приветствие, подкаст, медитация, голосовое задание или короткая практика для участников клуба.",
      media: assets.audio,
      thumbnail: assets.audioThumb
    },
    {
      kind: "text" as const,
      title: "Всё вместе: клубная программа",
      summary: "Текст, фото, видео и аудио внутри одной карточки.",
      body: "Полноценный пример урока для демонстрации: вводный текст, визуальный материал, видеофрагмент и аудиосопровождение собраны в одной карточке.",
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

    if (!item || card.title !== "Всё вместе: клубная программа") {
      continue;
    }

    await db.insert(lessonMaterials).values([
      {
        contentItemId: item.id,
        kind: "text",
        title: "Текст: структура занятия",
        description: "Вводный блок",
        body: "Опишите цель урока, кому он подходит, сколько времени займёт и что участник получит после прохождения.",
        sortOrder: 0,
        createdAt: now,
        updatedAt: now
      },
      {
        contentItemId: item.id,
        kind: "photo",
        title: "Фото: визуальный пример",
        description: "Атмосфера клуба",
        body: "Изображение можно использовать как обложку занятия, пример результата или визуальный референс.",
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
        title: "Видео: практический фрагмент",
        description: "Смотреть внутри урока",
        body: "Короткий видеоблок можно добавить после текста, чтобы участник сразу видел последовательность действий.",
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
        title: "Аудио: сопровождение",
        description: "Музыкальная дорожка",
        body: "Аудио подходит для подкастов, голосовых инструкций, медитаций и фонового сопровождения занятия.",
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
      createDemoImage({ title: "Атмосфера", subtitle: "закрытого клуба", layout: "vertical", variant: "photo" }),
      createDemoImage({ title: "Атмосфера", subtitle: "закрытого клуба", layout: "horizontal", variant: "photo" }),
      createDemoImage({ title: "Видео", subtitle: "знакомство с клубом", layout: "vertical", variant: "video" }),
      createDemoImage({ title: "Видео", subtitle: "знакомство с клубом", layout: "horizontal", variant: "video" }),
      createDemoImage({ title: "Аудио", subtitle: "приветствие клуба", layout: "vertical", variant: "audio" }),
      createDemoImage({ title: "Аудио", subtitle: "приветствие клуба", layout: "horizontal", variant: "audio" }),
      createDemoImage({ title: "Программа", subtitle: "текст + медиа", layout: "vertical", variant: "all" }),
      createDemoImage({ title: "Программа", subtitle: "текст + медиа", layout: "horizontal", variant: "all" })
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
