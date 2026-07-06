import { mkdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { env } from "../env";

const uploadRoot = resolve(env.UPLOADS_DIR);

function resolveUploadPath(key: string) {
  const safeKey = key.replace(/^\/+/, "");
  const resolved = resolve(uploadRoot, safeKey);
  if (resolved !== uploadRoot && !resolved.startsWith(`${uploadRoot}${sep}`)) {
    throw new Error("Invalid upload path");
  }

  return resolved;
}

export async function saveLocalUpload({ key, body }: { key: string; body: Uint8Array }) {
  const normalizedKey = key.replace(/^\/+/, "");
  const filePath = resolveUploadPath(normalizedKey);
  await mkdir(dirname(filePath), { recursive: true });
  await Bun.write(filePath, body);

  return {
    key: normalizedKey,
    url: `${env.WEB_ORIGIN.replace(/\/+$/, "")}/api/uploads/${normalizedKey}`
  };
}

export async function getLocalUploadResponse(key: string) {
  const filePath = resolveUploadPath(key);
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }

  return new Response(file, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": file.type || "application/octet-stream"
    }
  });
}
