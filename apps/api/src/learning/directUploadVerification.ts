export type UploadedObjectExpectation = {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
};

type UploadedObjectMetadata = {
  key: string;
  contentType: string | null;
  sizeBytes: number | null;
};

export type UploadedObjectVerificationFailureReason =
  | "OBJECT_NOT_VISIBLE"
  | "SIZE_MISMATCH"
  | "CONTENT_TYPE_MISMATCH";

type UploadedObjectVerificationResult =
  | { ok: true; metadata: UploadedObjectMetadata }
  | { ok: false; reason: UploadedObjectVerificationFailureReason; detail: string };

const defaultRetryDelaysMs = [120, 300, 700];

function sleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

function compareMetadata(expected: UploadedObjectExpectation, metadata: UploadedObjectMetadata): UploadedObjectVerificationResult {
  if (metadata.sizeBytes !== expected.sizeBytes) {
    return {
      ok: false,
      reason: "SIZE_MISMATCH",
      detail: `S3 reports ${metadata.sizeBytes ?? "unknown"} bytes, client reports ${expected.sizeBytes} bytes`
    };
  }

  if (metadata.contentType && metadata.contentType !== expected.contentType) {
    return {
      ok: false,
      reason: "CONTENT_TYPE_MISMATCH",
      detail: `S3 reports ${metadata.contentType}, client reports ${expected.contentType}`
    };
  }

  return { ok: true, metadata };
}

export async function verifyUploadedObjectMetadata({
  expected,
  loadMetadata,
  retryDelaysMs = defaultRetryDelaysMs,
  wait = sleep
}: {
  expected: UploadedObjectExpectation;
  loadMetadata: (objectKey: string) => Promise<UploadedObjectMetadata>;
  retryDelaysMs?: number[];
  wait?: (delayMs: number) => Promise<void>;
}): Promise<UploadedObjectVerificationResult> {
  let lastFailure: Exclude<UploadedObjectVerificationResult, { ok: true }> = {
    ok: false,
    reason: "OBJECT_NOT_VISIBLE",
    detail: "S3 did not expose the completed multipart object in time"
  };

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      const metadata = await loadMetadata(expected.objectKey);
      const comparison = compareMetadata(expected, metadata);
      if (comparison.ok) {
        return comparison;
      }
      lastFailure = comparison;
    } catch (error) {
      lastFailure = {
        ok: false,
        reason: "OBJECT_NOT_VISIBLE",
        detail: error instanceof Error ? error.message : "S3 metadata request failed"
      };
    }

    const retryDelay = retryDelaysMs[attempt];
    if (retryDelay !== undefined) {
      await wait(retryDelay);
    }
  }

  return lastFailure;
}
