import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({ env: {} }));
vi.mock("../db/client", () => ({ db: { query: { clubSettings: { findFirst: vi.fn() } } } }));
vi.mock("../logger", () => ({ logger: { warn: vi.fn() } }));

import { promoteObjectVersionWithClient } from "./s3";

const endpoint = process.env.COMMUNITY_UPLOAD_S3_INTEGRATION_ENDPOINT;
const bucket = process.env.COMMUNITY_UPLOAD_S3_INTEGRATION_BUCKET;
const accessKeyId = process.env.COMMUNITY_UPLOAD_S3_INTEGRATION_ACCESS_KEY_ID;
const secretAccessKey = process.env.COMMUNITY_UPLOAD_S3_INTEGRATION_SECRET_ACCESS_KEY;
const enabled = Boolean(endpoint && bucket && accessKeyId && secretAccessKey);
const client = enabled ? new S3Client({
  endpoint: endpoint!,
  region: process.env.COMMUNITY_UPLOAD_S3_INTEGRATION_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! }
}) : null;

afterAll(() => client?.destroy());

describe.runIf(enabled)("community immutable promotion against S3-compatible storage", () => {
  it("keeps the promoted bytes unchanged after the same presigned PUT URL is reused", async () => {
    const suffix = randomUUID();
    const stagingKey = `integration/community/pending/${suffix}.pdf`;
    const finalKey = `integration/community/quarantine/${suffix}.pdf`;
    const clean = new TextEncoder().encode("%PDF-clean-payload");
    const replacement = new TextEncoder().encode("%PDF-evil-payload!");
    expect(replacement.byteLength).toBe(clean.byteLength);
    try {
      const uploadUrl = await getSignedUrl(client!, new PutObjectCommand({
        Bucket: bucket!,
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
      const head = await client!.send(new HeadObjectCommand({ Bucket: bucket!, Key: stagingKey }));
      expect(head.ETag).toBeTruthy();

      await promoteObjectVersionWithClient({
        client: client!,
        bucket: bucket!,
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
      const final = await client!.send(new GetObjectCommand({ Bucket: bucket!, Key: finalKey }));
      await expect(final.Body?.transformToByteArray()).resolves.toEqual(clean);
    } finally {
      await Promise.allSettled([
        client!.send(new DeleteObjectCommand({ Bucket: bucket!, Key: stagingKey })),
        client!.send(new DeleteObjectCommand({ Bucket: bucket!, Key: finalKey }))
      ]);
    }
  });
});
