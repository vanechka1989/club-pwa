import {
  decodeCommunityRealtimeEnvelope,
  encodeCommunityRealtimeEnvelope,
  type CommunityRealtimeEnvelope
} from "./realtimeEnvelope";

const communityRealtimeChannel = "club:community:changes:v1";
let publisher: Bun.RedisClient | null = null;
let subscriber: Bun.RedisClient | null = null;
let subscriberStarted = false;

function warnRedisFailure(error: unknown, message: string) {
  void import("../logger").then(({ logger }) => logger.warn({ error }, message));
}

function createRedisClient() {
  return process.env.REDIS_URL ? new Bun.RedisClient(process.env.REDIS_URL) : null;
}

function getPublisher() {
  publisher ??= createRedisClient();
  return publisher;
}

export function publishCommunityRealtimeEnvelope(envelope: CommunityRealtimeEnvelope) {
  const client = getPublisher();
  if (!client) return;

  void client
    .publish(communityRealtimeChannel, encodeCommunityRealtimeEnvelope(envelope))
    .catch((error) => warnRedisFailure(error, "Unable to publish community realtime event to Redis"));
}

export function subscribeToCommunityRealtimeEnvelopes(listener: (envelope: CommunityRealtimeEnvelope) => void) {
  if (!process.env.REDIS_URL || subscriberStarted) return () => undefined;

  subscriberStarted = true;
  subscriber = createRedisClient();
  const client = subscriber;
  if (!client) return () => undefined;

  const handleMessage = (message: string) => {
    const envelope = decodeCommunityRealtimeEnvelope(message);
    if (envelope) listener(envelope);
  };

  void client
    .subscribe(communityRealtimeChannel, handleMessage)
    .catch((error) => {
      subscriberStarted = false;
      warnRedisFailure(error, "Unable to subscribe to community realtime Redis channel");
    });

  return () => {
    subscriberStarted = false;
    void client.unsubscribe(communityRealtimeChannel, handleMessage).catch(() => undefined);
    client.close();
    if (subscriber === client) subscriber = null;
  };
}

export async function checkCommunityRedisReady() {
  if (!process.env.REDIS_URL) return { configured: false, ready: true };
  try {
    const response = await getPublisher()?.ping();
    return { configured: true, ready: response === "PONG" };
  } catch {
    return { configured: true, ready: false };
  }
}
