import { eq } from "drizzle-orm";
import { prepareCommunityVoice } from "../community/mediaUpload";
import { db } from "../db/client";
import { clubMessageAttachments } from "../db/schema";
import { deleteObject, getObjectReadUrl, uploadObject } from "../storage/s3";

const attachments = await db.query.clubMessageAttachments.findMany({
  where: eq(clubMessageAttachments.kind, "voice")
});

let migrated = 0;
for (const attachment of attachments) {
  if (attachment.contentType === "audio/mp4" && attachment.objectKey.toLowerCase().endsWith(".m4a")) continue;
  const response = await fetch(await getObjectReadUrl(attachment.objectKey));
  if (!response.ok) throw new Error(`Unable to read ${attachment.objectKey}: ${response.status}`);
  const original = new File([await response.arrayBuffer()], attachment.objectKey.split("/").at(-1) || "voice.webm", {
    type: attachment.contentType
  });
  const prepared = await prepareCommunityVoice(original);
  const nextKey = attachment.objectKey.replace(/\.[a-z0-9]+$/i, "") + ".m4a";
  await uploadObject({ key: nextKey, body: prepared.body, contentType: prepared.contentType });
  await db.update(clubMessageAttachments).set({
    objectKey: nextKey,
    contentType: prepared.contentType,
    sizeBytes: prepared.body.byteLength
  }).where(eq(clubMessageAttachments.id, attachment.id));
  await deleteObject(attachment.objectKey);
  migrated += 1;
  console.log(`Migrated ${attachment.id} to ${nextKey}`);
}

console.log(`Community voice migration complete: ${migrated}`);
process.exit(0);
