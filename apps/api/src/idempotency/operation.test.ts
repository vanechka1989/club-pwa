import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import migrationJournal from "../../drizzle/meta/_journal.json";
import { createRequestFingerprint, idempotencyOperationStatuses } from "./operation";

describe("idempotency operations", () => {
  it("creates the same fingerprint for equivalent request objects", () => {
    expect(createRequestFingerprint({ title: "Lesson", nested: { b: 2, a: 1 } })).toBe(
      createRequestFingerprint({ nested: { a: 1, b: 2 }, title: "Lesson" })
    );
    expect(createRequestFingerprint({ title: "Lesson" })).not.toBe(createRequestFingerprint({ title: "Other" }));
  });

  it("defines durable operation statuses and database constraints", () => {
    const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
    const migration = readFileSync(new URL("../../drizzle/0048_idempotency_operations.sql", import.meta.url), "utf8");

    expect(idempotencyOperationStatuses).toEqual(["processing", "succeeded", "failed"]);
    expect(schema).toContain('"idempotency_operations"');
    expect(migration).toContain('CREATE TABLE "idempotency_operations"');
    expect(migration).toContain('idempotency_operations_actor_scope_key_idx');
    expect(migration).toContain('idempotency_operations_expires_idx');
  });

  it("registers migration 0048", () => {
    expect(migrationJournal.entries.at(-1)).toMatchObject({
      idx: 48,
      tag: "0048_idempotency_operations"
    });
  });
});
