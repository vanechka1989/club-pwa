import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({ env: {} }));
vi.mock("../db/client", () => ({ db: { query: { clubSettings: { findFirst: vi.fn() } } } }));
vi.mock("../logger", () => ({ logger: { warn: vi.fn() } }));

import { promoteObjectVersionWithClient } from "./s3";
import { resolveCommunityIntegrationTestConfig } from "../community/postgresTestGate";

const integrationConfig = resolveCommunityIntegrationTestConfig();
const s3 = integrationConfig?.s3;
const integrationDescribe = s3 ? describe : describe.skip;
const client = s3 ? new S3Client({
  endpoint: s3.endpoint,
  region: s3.region,
  forcePathStyle: true,
  credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey }
}) : null;

afterAll(() => client?.destroy());

integrationDescribe("community immutable promotion against S3-compatible storage", () => {
  it("keeps the promoted bytes unchanged after the same presigned PUT URL is reused", async () => {
    const suffix = randomUUID();
    const stagingKey = `integration/community/pending/${suffix}.pdf`;
    const finalKey = `integration/community/quarantine/${suffix}.pdf`;
    const clean = new TextEncoder().encode("%PDF-clean-payload");
    const replacement = new TextEncoder().encode("%PDF-evil-payload!");
    expect(replacement.byteLength).toBe(clean.byteLength);
    try {
      const uploadUrl = await getSignedUrl(client!, new PutObjectCommand({
        Bucket: s3!.bucket,
        Key: stagingKey,
        ContentType: "application/pdf",
        ContentLength: clean.byteLength
      }), { expiresIn: 60 });
      const firstPut = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: clean
      });
      expect(firstPut.ok).toBe(true);
      const head = await client!.send(new HeadObjectCommand({ Bucket: s3!.bucket, Key: stagingKey }));
      expect(head.ETag).toBeTruthy();

      await promoteObjectVersionWithClient({
        client: client!,
        bucket: s3!.bucket,
        sourceKey: stagingKey,
        destinationKey: finalKey,
        expectedETag: head.ETag!,
        contentType: "application/pdf"
      });

      const secondPut = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": "application/pdf" },
        body: replacement
      });
      expect(secondPut.ok).toBe(true);
      const final = await client!.send(new GetObjectCommand({ Bucket: s3!.bucket, Key: finalKey }));
      await expect(final.Body?.transformToByteArray()).resolves.toEqual(clean);
    } finally {
      await Promise.allSettled([
        client!.send(new DeleteObjectCommand({ Bucket: s3!.bucket, Key: stagingKey })),
        client!.send(new DeleteObjectCommand({ Bucket: s3!.bucket, Key: finalKey }))
      ]);
    }
  });
});
