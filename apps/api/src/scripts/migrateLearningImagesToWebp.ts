import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { contentItems, lessonMaterials } from "../db/schema";
import { optimizeImageForUpload, shouldOptimizeImageContentType } from "../storage/imageOptimizer";
import { deleteObject, getObjectReadUrl, mirrorObjectToReserve, uploadObject } from "../storage/s3";

type MigratedImage = {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
};

const migratedByKey = new Map<string, MigratedImage>();
const obsoleteKeys = new Set<string>();

async function migrateImage(objectKey: string, contentType: string, maxDimension: number) {
  const cached = migratedByKey.get(objectKey);
  if (cached) return cached;

  const response = await fetch(await getObjectReadUrl(objectKey, "primary", { verifyReadable: true }));
  if (!response.ok) throw new Error(`Unable to read ${objectKey}: ${response.status}`);

  const optimized = await optimizeImageForUpload({
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType,
    fileName: objectKey.split("/").at(-1) || "lesson-image.jpg",
    maxDimension,
    forceWebp: true
  });
  const nextKey = objectKey.replace(/\.[a-z0-9]+$/i, "") + ".webp";
  await uploadObject({ key: nextKey, body: optimized.body, contentType: optimized.contentType });
  // uploadObject mirrors asynchronously during normal requests. A one-shot
  // migration exits immediately, so wait for the reserve copy explicitly.
  await mirrorObjectToReserve(nextKey, optimized.contentType);

  const migrated = {
    objectKey: nextKey,
    contentType: optimized.contentType,
    sizeBytes: optimized.sizeBytes
  };
  migratedByKey.set(objectKey, migrated);
  if (nextKey !== objectKey) obsoleteKeys.add(objectKey);
  return migrated;
}

let migratedReferences = 0;
const now = new Date();
const items = await db.query.contentItems.findMany();

for (const item of items) {
  if (item.mediaObjectKey && item.mediaContentType && shouldOptimizeImageContentType(item.mediaContentType)) {
    const migrated = await migrateImage(item.mediaObjectKey, item.mediaContentType, 1920);
    await db.update(contentItems).set({
      mediaObjectKey: migrated.objectKey,
      mediaContentType: migrated.contentType,
      mediaSizeBytes: migrated.sizeBytes,
      updatedAt: now
    }).where(eq(contentItems.id, item.id));
    migratedReferences += 1;
  }

  if (item.thumbnailObjectKey && item.thumbnailContentType && shouldOptimizeImageContentType(item.thumbnailContentType)) {
    const migrated = await migrateImage(item.thumbnailObjectKey, item.thumbnailContentType, 1200);
    await db.update(contentItems).set({
      thumbnailObjectKey: migrated.objectKey,
      thumbnailContentType: migrated.contentType,
      thumbnailSizeBytes: migrated.sizeBytes,
      updatedAt: now
    }).where(eq(contentItems.id, item.id));
    migratedReferences += 1;
  }
}

const materials = await db.query.lessonMaterials.findMany();
for (const material of materials) {
  if (!material.mediaObjectKey || !material.mediaContentType || !shouldOptimizeImageContentType(material.mediaContentType)) continue;

  const migrated = await migrateImage(material.mediaObjectKey, material.mediaContentType, 1920);
  await db.update(lessonMaterials).set({
    mediaObjectKey: migrated.objectKey,
    mediaContentType: migrated.contentType,
    mediaSizeBytes: migrated.sizeBytes,
    updatedAt: now
  }).where(eq(lessonMaterials.id, material.id));
  migratedReferences += 1;
}

for (const obsoleteKey of obsoleteKeys) {
  await deleteObject(obsoleteKey).catch((error) => {
    console.warn(`Unable to remove obsolete ${obsoleteKey}`, error);
  });
  await deleteObject(obsoleteKey, "reserve").catch(() => {
    // Reserve storage is optional and older objects may not exist there.
  });
}

console.log(`Learning image migration complete: ${migratedReferences} references, ${migratedByKey.size} objects`);
process.exit(0);
