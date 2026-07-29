import { describe, expect, it } from "vitest";
import {
  resolveCommunityIntegrationTestConfig,
  resolveMessageMutationTestDatabaseUrl
} from "./postgresTestGate";

const completeEnvironment = {
  COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL: "postgres://club:club@localhost:5432/club",
  COMMUNITY_TOPIC_STATE_TEST_DATABASE_URL: "postgres://club:club@localhost:5432/club",
  COMMUNITY_MESSAGE_SEARCH_TEST_DATABASE_URL: "postgres://club:club@localhost:5432/club",
  COMMUNITY_UPLOAD_S3_INTEGRATION_ENDPOINT: "http://127.0.0.1:9000",
  COMMUNITY_UPLOAD_S3_INTEGRATION_BUCKET: "community-release-gate",
  COMMUNITY_UPLOAD_S3_INTEGRATION_RESERVE_BUCKET: "community-release-gate-reserve",
  COMMUNITY_UPLOAD_S3_INTEGRATION_ACCESS_KEY_ID: "community-ci",
  COMMUNITY_UPLOAD_S3_INTEGRATION_SECRET_ACCESS_KEY: "community-ci-secret",
  COMMUNITY_UPLOAD_S3_INTEGRATION_REGION: "us-east-1",
  COMMUNITY_CLAMAV_INTEGRATION_HOST: "127.0.0.1",
  COMMUNITY_CLAMAV_INTEGRATION_PORT: "3310"
};

describe("message mutation PostgreSQL test gate", () => {
  it("fails CI instead of silently skipping when the dedicated database URL is missing", () => {
    expect(() => resolveMessageMutationTestDatabaseUrl({ CI: "true" })).toThrow(
      "COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL is required in CI"
    );
  });

  it("allows local unit runs to skip and resolves configured integration URLs", () => {
    expect(resolveMessageMutationTestDatabaseUrl({})).toBeUndefined();
    expect(resolveMessageMutationTestDatabaseUrl(completeEnvironment))
      .toBe("postgres://club:club@localhost:5432/club");
  });

  it("returns one complete integration configuration and permits a fully empty local environment", () => {
    expect(resolveCommunityIntegrationTestConfig({})).toBeUndefined();
    expect(resolveCommunityIntegrationTestConfig(completeEnvironment)).toEqual({
      postgres: {
        messageMutationDatabaseUrl: completeEnvironment.COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL,
        topicStateDatabaseUrl: completeEnvironment.COMMUNITY_TOPIC_STATE_TEST_DATABASE_URL,
        messageSearchDatabaseUrl: completeEnvironment.COMMUNITY_MESSAGE_SEARCH_TEST_DATABASE_URL
      },
      s3: {
        endpoint: completeEnvironment.COMMUNITY_UPLOAD_S3_INTEGRATION_ENDPOINT,
        bucket: completeEnvironment.COMMUNITY_UPLOAD_S3_INTEGRATION_BUCKET,
        reserveBucket: completeEnvironment.COMMUNITY_UPLOAD_S3_INTEGRATION_RESERVE_BUCKET,
        accessKeyId: completeEnvironment.COMMUNITY_UPLOAD_S3_INTEGRATION_ACCESS_KEY_ID,
        secretAccessKey: completeEnvironment.COMMUNITY_UPLOAD_S3_INTEGRATION_SECRET_ACCESS_KEY,
        region: completeEnvironment.COMMUNITY_UPLOAD_S3_INTEGRATION_REGION
      },
      clamAv: { host: "127.0.0.1", port: 3310 }
    });
  });

  it.each([
    ["partial PostgreSQL", { COMMUNITY_TOPIC_STATE_TEST_DATABASE_URL: completeEnvironment.COMMUNITY_TOPIC_STATE_TEST_DATABASE_URL }],
    ["partial S3", { COMMUNITY_UPLOAD_S3_INTEGRATION_ENDPOINT: completeEnvironment.COMMUNITY_UPLOAD_S3_INTEGRATION_ENDPOINT }],
    ["partial ClamAV", { COMMUNITY_CLAMAV_INTEGRATION_HOST: completeEnvironment.COMMUNITY_CLAMAV_INTEGRATION_HOST }]
  ])("fails closed for %s configuration", (_label, partial) => {
    expect(() => resolveCommunityIntegrationTestConfig(partial)).toThrow("Incomplete community integration test environment");
  });

  it.each(["0", "65536", "not-a-port"])("rejects invalid ClamAV port %s", (port) => {
    expect(() => resolveCommunityIntegrationTestConfig({
      ...completeEnvironment,
      COMMUNITY_CLAMAV_INTEGRATION_PORT: port
    })).toThrow("COMMUNITY_CLAMAV_INTEGRATION_PORT");
  });

  it("requires every external field under CI and validates PostgreSQL URLs", () => {
    expect(() => resolveCommunityIntegrationTestConfig({ CI: "true" }))
      .toThrow("Incomplete community integration test environment");
    expect(() => resolveCommunityIntegrationTestConfig({
      ...completeEnvironment,
      COMMUNITY_MESSAGE_SEARCH_TEST_DATABASE_URL: "not-a-postgres-url"
    })).toThrow("COMMUNITY_MESSAGE_SEARCH_TEST_DATABASE_URL");
  });
});
