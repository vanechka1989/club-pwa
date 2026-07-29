const integrationEnvironmentKeys = [
  "COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL",
  "COMMUNITY_TOPIC_STATE_TEST_DATABASE_URL",
  "COMMUNITY_MESSAGE_SEARCH_TEST_DATABASE_URL",
  "COMMUNITY_UPLOAD_S3_INTEGRATION_ENDPOINT",
  "COMMUNITY_UPLOAD_S3_INTEGRATION_BUCKET",
  "COMMUNITY_UPLOAD_S3_INTEGRATION_RESERVE_BUCKET",
  "COMMUNITY_UPLOAD_S3_INTEGRATION_ACCESS_KEY_ID",
  "COMMUNITY_UPLOAD_S3_INTEGRATION_SECRET_ACCESS_KEY",
  "COMMUNITY_UPLOAD_S3_INTEGRATION_REGION",
  "COMMUNITY_CLAMAV_INTEGRATION_HOST",
  "COMMUNITY_CLAMAV_INTEGRATION_PORT"
] as const;

type CommunityIntegrationEnvironment = Partial<Record<
  "CI" | typeof integrationEnvironmentKeys[number],
  string
>>;

function requirePostgresUrl(name: string, value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("invalid protocol");
    return value;
  } catch {
    throw new Error(`${name} must be a valid PostgreSQL URL`);
  }
}

export function resolveCommunityIntegrationTestConfig(
  environment: CommunityIntegrationEnvironment = process.env as CommunityIntegrationEnvironment
) {
  const presentKeys = integrationEnvironmentKeys.filter((key) => Boolean(environment[key]?.trim()));
  if (environment.CI !== "true" && presentKeys.length === 0) return undefined;
  const missingKeys = integrationEnvironmentKeys.filter((key) => !environment[key]?.trim());
  if (missingKeys.length) {
    throw new Error(`Incomplete community integration test environment: missing ${missingKeys.join(", ")}`);
  }

  const clamAvPort = Number(environment.COMMUNITY_CLAMAV_INTEGRATION_PORT);
  if (!Number.isInteger(clamAvPort) || clamAvPort < 1 || clamAvPort > 65_535) {
    throw new Error("COMMUNITY_CLAMAV_INTEGRATION_PORT must be an integer from 1 to 65535");
  }
  try {
    const endpoint = new URL(environment.COMMUNITY_UPLOAD_S3_INTEGRATION_ENDPOINT!);
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") throw new Error("invalid protocol");
  } catch {
    throw new Error("COMMUNITY_UPLOAD_S3_INTEGRATION_ENDPOINT must be a valid HTTP(S) URL");
  }

  return {
    postgres: {
      messageMutationDatabaseUrl: requirePostgresUrl(
        "COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL",
        environment.COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL!
      ),
      topicStateDatabaseUrl: requirePostgresUrl(
        "COMMUNITY_TOPIC_STATE_TEST_DATABASE_URL",
        environment.COMMUNITY_TOPIC_STATE_TEST_DATABASE_URL!
      ),
      messageSearchDatabaseUrl: requirePostgresUrl(
        "COMMUNITY_MESSAGE_SEARCH_TEST_DATABASE_URL",
        environment.COMMUNITY_MESSAGE_SEARCH_TEST_DATABASE_URL!
      )
    },
    s3: {
      endpoint: environment.COMMUNITY_UPLOAD_S3_INTEGRATION_ENDPOINT!,
      bucket: environment.COMMUNITY_UPLOAD_S3_INTEGRATION_BUCKET!,
      reserveBucket: environment.COMMUNITY_UPLOAD_S3_INTEGRATION_RESERVE_BUCKET!,
      accessKeyId: environment.COMMUNITY_UPLOAD_S3_INTEGRATION_ACCESS_KEY_ID!,
      secretAccessKey: environment.COMMUNITY_UPLOAD_S3_INTEGRATION_SECRET_ACCESS_KEY!,
      region: environment.COMMUNITY_UPLOAD_S3_INTEGRATION_REGION!
    },
    clamAv: {
      host: environment.COMMUNITY_CLAMAV_INTEGRATION_HOST!,
      port: clamAvPort
    }
  };
}

export function resolveMessageMutationTestDatabaseUrl(
  environment: CommunityIntegrationEnvironment = process.env as CommunityIntegrationEnvironment
) {
  if (environment.CI === "true" && !environment.COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL) {
    throw new Error("COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL is required in CI");
  }
  return resolveCommunityIntegrationTestConfig(environment)?.postgres.messageMutationDatabaseUrl;
}
