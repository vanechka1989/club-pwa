import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import postgres from "postgres";

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_required`);
  return value;
};

const stage = required("KILLED_PUBLISHER_STAGE");
const databaseUrl = required("KILLED_PUBLISHER_DATABASE_URL");
const messageId = required("KILLED_PUBLISHER_MESSAGE_ID");
const topicId = required("KILLED_PUBLISHER_TOPIC_ID");
const userId = required("KILLED_PUBLISHER_USER_ID");
const attachments = JSON.parse(required("KILLED_PUBLISHER_ATTACHMENTS"));
const targets = JSON.parse(required("KILLED_PUBLISHER_TARGETS"));
const buckets = {
  primary: required("KILLED_PUBLISHER_PRIMARY_BUCKET"),
  reserve: required("KILLED_PUBLISHER_RESERVE_BUCKET")
};
const database = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
const s3 = new S3Client({
  endpoint: required("KILLED_PUBLISHER_S3_ENDPOINT"),
  region: required("KILLED_PUBLISHER_S3_REGION"),
  forcePathStyle: true,
  credentials: {
    accessKeyId: required("KILLED_PUBLISHER_S3_ACCESS_KEY_ID"),
    secretAccessKey: required("KILLED_PUBLISHER_S3_SECRET_ACCESS_KEY")
  }
});

const signalStage = (name) => process.stdout.write(`${JSON.stringify({ stage: name })}\n`);
const hangUntilKilled = () => new Promise(() => undefined);
const writeKey = async (key, selectedTargets = targets) => {
  for (const target of selectedTargets) {
    await s3.send(new PutObjectCommand({
      Bucket: buckets[target],
      Key: key,
      Body: new TextEncoder().encode(`${stage}:${target}:${key}`),
      ContentType: key.endsWith(".m4a") ? "audio/mp4" : "image/webp"
    }));
  }
};

try {
  await database.begin(async (transaction) => {
    await transaction`
      insert into club_chat_messages (id, topic_id, user_id, body)
      values (${messageId}, ${topicId}, ${userId}, ${stage})
    `;
    for (const attachment of attachments) {
      await transaction`
        insert into club_message_attachments (id, message_id, object_key, scan_status)
        values (${attachment.id}, ${messageId}, ${attachment.key}, 'pending')
      `;
      const publication = await transaction`
        insert into community_object_publications (
          source_type, source_id, object_key, state, updated_at
        ) values ('attachment', ${attachment.id}, ${attachment.key}, 'publishing', clock_timestamp())
        returning publication_token as "publicationToken"
      `;
      for (const target of targets) {
        await transaction`
          insert into community_object_lifecycles (
            object_key, target, generation, state, publication_token, next_reconcile_at, updated_at
          ) values (
            ${attachment.key}, ${target}, 1, 'publishing',
            ${publication[0].publicationToken}, clock_timestamp(), clock_timestamp()
          )
        `;
      }
    }
  });
  signalStage("db-plan-ready");
  if (stage === "db-plan-before-write") await hangUntilKilled();

  if (stage === "write-before-commit") {
    for (const attachment of attachments) await writeKey(attachment.key);
    signalStage("provider-write-ready");
    await hangUntilKilled();
  }

  if (stage === "partial-gallery") {
    const [first, second] = attachments;
    await writeKey(first.key);
    await database.begin(async (transaction) => {
      const publications = await transaction`
        select publication_token as "publicationToken"
        from community_object_publications
        where source_type = 'attachment' and source_id = ${first.id}
        for update
      `;
      await transaction`
        update club_message_attachments set scan_status = 'ready'
        where id = ${first.id}
      `;
      await transaction`
        update community_object_lifecycles
        set state = 'present', publication_token = null, updated_at = clock_timestamp()
        where object_key = ${first.key}
          and publication_token = ${publications[0].publicationToken}
      `;
      await transaction`
        delete from community_object_publications
        where source_type = 'attachment' and source_id = ${first.id}
      `;
    });
    await writeKey(second.key, ["primary"]);
    signalStage("partial-gallery-ready");
    await hangUntilKilled();
  }

  throw new Error(`unknown_stage:${stage}`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
} finally {
  s3.destroy();
  await database.end({ timeout: 1 }).catch(() => undefined);
}
