import { describe, expect, it } from "vitest";
import { resolveMessageMutationTestDatabaseUrl } from "./postgresTestGate";

describe("message mutation PostgreSQL test gate", () => {
  it("fails CI instead of silently skipping when the dedicated database URL is missing", () => {
    expect(() => resolveMessageMutationTestDatabaseUrl({ CI: "true" })).toThrow(
      "COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL is required in CI"
    );
  });

  it("allows local unit runs to skip and resolves configured integration URLs", () => {
    expect(resolveMessageMutationTestDatabaseUrl({})).toBeUndefined();
    expect(resolveMessageMutationTestDatabaseUrl({
      COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL: "postgres://club:club@localhost:5432/club"
    })).toBe("postgres://club:club@localhost:5432/club");
  });
});
