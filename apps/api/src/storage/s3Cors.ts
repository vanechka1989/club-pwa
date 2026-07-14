export function buildBrowserUploadCorsRule(webOrigin: string) {
  return {
    AllowedOrigins: [new URL(webOrigin).origin],
    AllowedMethods: ["GET", "HEAD", "PUT"],
    AllowedHeaders: ["*"],
    ExposeHeaders: ["ETag"],
    MaxAgeSeconds: 3600
  };
}
