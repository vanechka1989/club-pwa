import { describe, expect, it } from "vitest";
import { buildBrowserUploadCorsRule } from "./s3Cors";

describe("buildBrowserUploadCorsRule", () => {
  it("allows browser uploads from the application origin and exposes multipart ETags", () => {
    expect(buildBrowserUploadCorsRule("https://club2.myn8nservertest.ru/path")).toEqual({
      AllowedOrigins: ["https://club2.myn8nservertest.ru"],
      AllowedMethods: ["GET", "HEAD", "PUT"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3600
    });
  });
});
