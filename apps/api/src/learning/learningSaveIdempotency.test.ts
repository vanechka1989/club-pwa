import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decideLearningSaveClaim } from "./learningSaveIdempotency";

const matchingOperation = {
  requestFingerprint: "fingerprint",
  status: "processing",
  resourceId: null,
  errorCode: null
};

describe("learning save idempotency", () => {
  it("claims a missing key and preserves terminal outcomes", () => {
    expect(decideLearningSaveClaim(null, "fingerprint")).toEqual({ kind: "create" });
    expect(decideLearningSaveClaim({ ...matchingOperation, status: "succeeded", resourceId: "material-1" }, "fingerprint")).toEqual({
      kind: "succeeded",
      resourceId: "material-1"
    });
    expect(decideLearningSaveClaim({ ...matchingOperation, status: "failed", errorCode: "SAVE_FAILED" }, "fingerprint")).toEqual({
      kind: "failed",
      errorCode: "SAVE_FAILED"
    });
    expect(decideLearningSaveClaim(matchingOperation, "fingerprint")).toEqual({ kind: "processing" });
  });

  it("rejects reusing the same key for different card data", () => {
    expect(decideLearningSaveClaim(matchingOperation, "different")).toEqual({ kind: "conflict" });
  });

  it("wires an actor-scoped create key and operation lookup into admin routes", () => {
    const route = readFileSync(new URL("../routes/admin.ts", import.meta.url), "utf8");

    expect(route).toContain('c.req.header("Idempotency-Key")');
    expect(route).toContain('get("/learning/materials/operations/:key"');
    expect(route).toContain("idempotencyOperations.actorTelegramId");
    expect(route).toContain("createRequestFingerprint(body.data)");
    expect(route).toContain('code: "IDEMPOTENCY_KEY_REUSED"');
    expect(route).toContain('code: "IDEMPOTENCY_IN_PROGRESS"');
  });
});
