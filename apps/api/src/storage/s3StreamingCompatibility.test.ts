import { createServer } from "node:http";
import { Readable } from "node:stream";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it } from "vitest";
import { buildS3ClientOptions } from "./s3ClientOptions";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("S3 streaming compatibility", () => {
  it("sends a bounded stream without optional aws-chunked checksum framing", async () => {
    let receivedBody = Buffer.alloc(0);
    let receivedHeaders: Record<string, string | string[] | undefined> = {};
    const server = createServer((request, response) => {
      receivedHeaders = request.headers;
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        receivedBody = Buffer.concat(chunks);
        response.writeHead(200);
        response.end();
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not bind to a TCP port");
    }

    const client = new S3Client(buildS3ClientOptions({
      endpoint: `http://127.0.0.1:${address.port}`,
      region: "us-east-1",
      bucket: "test-bucket",
      accessKeyId: "test-access-key",
      secretAccessKey: "test-secret-key",
      publicBaseUrl: null,
      signedUrlTtlSeconds: 600,
      reserve: null
    }));

    await client.send(new PutObjectCommand({
      Bucket: "test-bucket",
      Key: "homework/test.jpg",
      Body: Readable.from([Buffer.from("homework-file")]),
      ContentType: "image/jpeg",
      ContentLength: 13
    }));
    client.destroy();

    expect(String(receivedHeaders["content-encoding"] ?? "")).not.toContain("aws-chunked");
    expect(receivedHeaders["x-amz-sdk-checksum-algorithm"]).toBeUndefined();
    expect(receivedHeaders["x-amz-trailer"]).toBeUndefined();
    expect(receivedBody.toString("utf8")).toBe("homework-file");
  });
});
