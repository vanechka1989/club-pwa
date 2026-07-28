type MessageMutationTestEnvironment = Partial<Record<
  "CI" | "COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL" | "COMMUNITY_TOPIC_STATE_TEST_DATABASE_URL",
  string
>>;

export function resolveMessageMutationTestDatabaseUrl(
  environment: MessageMutationTestEnvironment = process.env as MessageMutationTestEnvironment
) {
  const dedicatedUrl = environment.COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL;
  if (environment.CI === "true" && !dedicatedUrl) {
    throw new Error("COMMUNITY_MESSAGE_MUTATION_TEST_DATABASE_URL is required in CI");
  }
  return dedicatedUrl ?? environment.COMMUNITY_TOPIC_STATE_TEST_DATABASE_URL;
}
