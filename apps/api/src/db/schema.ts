import { relations, sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";

export const membershipStatus = pgEnum("membership_status", ["inactive", "active", "expired"]);
export const contentKind = pgEnum("content_kind", ["text", "photo", "video", "audio"]);
export const supportTicketStatus = pgEnum("support_ticket_status", ["open", "answered", "closed"]);
export const moderationStatus = pgEnum("moderation_status", ["visible", "hidden", "deleted"]);
export const muteKind = pgEnum("mute_kind", ["temporary", "permanent"]);
export const messageReaction = pgEnum("message_reaction", ["like", "dislike", "thumbs_up", "fire", "heart", "laugh", "clap", "poop"]);
export const paymentProductKind = pgEnum("payment_product_kind", ["one_time", "recurrent"]);
export const paymentAccessType = pgEnum("payment_access_type", ["limited", "lifetime"]);
export const paymentCurrency = pgEnum("payment_currency", ["RUB", "USD", "EUR"]);
export const paymentOrderStatus = pgEnum("payment_order_status", ["pending", "paid", "failed", "cancelled"]);
export const recurrentSubscriptionStatus = pgEnum("recurrent_subscription_status", ["active", "cancelled"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramId: varchar("telegram_id", { length: 320 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 32 }),
    phoneSource: varchar("phone_source", { length: 24 }),
    phoneUpdatedAt: timestamp("phone_updated_at", { withTimezone: true }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    marketingEmailOptOutAt: timestamp("marketing_email_opt_out_at", { withTimezone: true }),
    firstName: varchar("first_name", { length: 128 }),
    username: varchar("username", { length: 64 }),
    displayName: varchar("display_name", { length: 20 }),
    displayNameChangedByUserAt: timestamp("display_name_changed_by_user_at", { withTimezone: true }),
    photoUrl: text("photo_url"),
    avatarObjectKey: text("avatar_object_key"),
    avatarRefreshedAt: timestamp("avatar_refreshed_at", { withTimezone: true }),
    avatarPositionX: integer("avatar_position_x").notNull().default(50),
    avatarPositionY: integer("avatar_position_y").notNull().default(50),
    avatarScale: integer("avatar_scale").notNull().default(100),
    telegramBotStatus: varchar("telegram_bot_status", { length: 16 }).notNull().default("unknown"),
    telegramBotBlockedAt: timestamp("telegram_bot_blocked_at", { withTimezone: true }),
    telegramBotUnblockedAt: timestamp("telegram_bot_unblocked_at", { withTimezone: true }),
    deviceSnapshot: jsonb("device_snapshot").$type<Record<string, unknown> | null>(),
    deviceSnapshotAt: timestamp("device_snapshot_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    telegramIdIdx: uniqueIndex("users_telegram_id_idx").on(table.telegramId),
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    createdAtIdx: index("users_created_at_idx").on(table.createdAt),
    updatedAtIdx: index("users_updated_at_idx").on(table.updatedAt)
  })
);

export const acquisitionLinks = pgTable(
  "acquisition_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aid: varchar("aid", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    source: varchar("source", { length: 80 }).notNull(),
    medium: varchar("medium", { length: 80 }).notNull(),
    campaign: varchar("campaign", { length: 120 }).notNull(),
    content: varchar("content", { length: 120 }),
    destinationKind: varchar("destination_kind", { length: 16 }).notNull().default("home"),
    destinationModuleId: uuid("destination_module_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    aidIdx: uniqueIndex("acquisition_links_aid_idx").on(table.aid),
    createdIdx: index("acquisition_links_created_idx").on(table.createdAt)
  })
);

export const acquisitionVisitors = pgTable(
  "acquisition_visitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitorHash: varchar("visitor_hash", { length: 64 }).notNull(),
    firstVisitedAt: timestamp("first_visited_at", { withTimezone: true }).notNull(),
    lastVisitedAt: timestamp("last_visited_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({ visitorHashIdx: uniqueIndex("acquisition_visitors_hash_idx").on(table.visitorHash) })
);

export const acquisitionVisits = pgTable(
  "acquisition_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitorId: uuid("visitor_id").notNull().references(() => acquisitionVisitors.id, { onDelete: "cascade" }),
    linkId: uuid("link_id").notNull().references(() => acquisitionLinks.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    linkTimeIdx: index("acquisition_visits_link_time_idx").on(table.linkId, table.occurredAt),
    visitorTimeIdx: index("acquisition_visits_visitor_time_idx").on(table.visitorId, table.occurredAt),
    userTimeIdx: index("acquisition_visits_user_time_idx").on(table.userId, table.occurredAt)
  })
);

export const userAcquisitionAttributions = pgTable(
  "user_acquisition_attributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    firstVisitId: uuid("first_visit_id").notNull().references(() => acquisitionVisits.id, { onDelete: "restrict" }),
    lastVisitId: uuid("last_visit_id").notNull().references(() => acquisitionVisits.id, { onDelete: "restrict" }),
    firstLinkId: uuid("first_link_id").notNull().references(() => acquisitionLinks.id, { onDelete: "restrict" }),
    lastLinkId: uuid("last_link_id").notNull().references(() => acquisitionLinks.id, { onDelete: "restrict" }),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdx: uniqueIndex("user_acquisition_attributions_user_idx").on(table.userId),
    firstLinkIdx: index("user_acquisition_attributions_first_link_idx").on(table.firstLinkId, table.registeredAt),
    lastLinkIdx: index("user_acquisition_attributions_last_link_idx").on(table.lastLinkId, table.registeredAt)
  })
);

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramId: varchar("telegram_id", { length: 320 }).notNull(),
    roleLabel: varchar("role_label", { length: 80 }),
    isActive: boolean("is_active").notNull().default(true),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    telegramIdIdx: uniqueIndex("admin_users_telegram_id_idx").on(table.telegramId)
  })
);

export const adminActionLogs = pgTable(
  "admin_action_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorTelegramId: varchar("actor_telegram_id", { length: 320 }).notNull(),
    action: varchar("action", { length: 96 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 128 }),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
    targetTelegramId: varchar("target_telegram_id", { length: 320 }),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    actorCreatedIdx: index("admin_action_logs_actor_created_idx").on(table.actorTelegramId, table.createdAt),
    actionCreatedIdx: index("admin_action_logs_action_created_idx").on(table.action, table.createdAt),
    homeworkResetUniqueIdx: uniqueIndex("admin_action_logs_homework_reset_unique").on(table.action, table.entityType, table.entityId).where(sql`${table.action} = 'learning.homework.reset'`),
    entityIdx: index("admin_action_logs_entity_idx").on(table.entityType, table.entityId),
    targetCreatedIdx: index("admin_action_logs_target_created_idx").on(table.targetTelegramId, table.createdAt),
    createdIdx: index("admin_action_logs_created_idx").on(table.createdAt)
  })
);

export const serverErrorLogs = pgTable(
  "server_error_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 180 }).notNull(),
    detail: text("detail").notNull(),
    path: text("path"),
    method: varchar("method", { length: 16 }),
    status: integer("status"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    createdIdx: index("server_error_logs_created_idx").on(table.createdAt),
    statusCreatedIdx: index("server_error_logs_status_created_idx").on(table.status, table.createdAt)
  })
);

export const errorGroups = pgTable(
  "error_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    source: varchar("source", { length: 32 }).notNull(),
    kind: varchar("kind", { length: 80 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("new"),
    route: text("route"),
    firstRelease: varchar("first_release", { length: 64 }),
    latestRelease: varchar("latest_release", { length: 64 }),
    totalCount: integer("total_count").notNull().default(1),
    affectedUsers: integer("affected_users").notNull().default(0),
    affectedDevices: integer("affected_devices").notNull().default(0),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    mutedUntil: timestamp("muted_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    fingerprintIdx: uniqueIndex("error_groups_fingerprint_idx").on(table.fingerprint),
    statusSeenIdx: index("error_groups_status_seen_idx").on(table.status, table.lastSeenAt),
    severitySeenIdx: index("error_groups_severity_seen_idx").on(table.severity, table.lastSeenAt)
  })
);

export const errorOccurrences = pgTable(
  "error_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => errorGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    installationId: varchar("installation_id", { length: 64 }),
    message: text("message").notNull(),
    stack: text("stack"),
    route: text("route"),
    method: varchar("method", { length: 16 }),
    httpStatus: integer("http_status"),
    release: varchar("release", { length: 64 }),
    platform: varchar("platform", { length: 120 }),
    userAgent: text("user_agent"),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    groupOccurredIdx: index("error_occurrences_group_occurred_idx").on(table.groupId, table.occurredAt),
    userOccurredIdx: index("error_occurrences_user_occurred_idx").on(table.userId, table.occurredAt),
    occurredIdx: index("error_occurrences_occurred_idx").on(table.occurredAt)
  })
);

export const errorNotificationDeliveries = pgTable(
  "error_notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull().references(() => errorGroups.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 16 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastError: varchar("last_error", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    groupCreatedIdx: index("error_notification_deliveries_group_created_idx").on(table.groupId, table.createdAt),
    statusUpdatedIdx: index("error_notification_deliveries_status_updated_idx").on(table.status, table.updatedAt)
  })
);

export const idempotencyOperations = pgTable(
  "idempotency_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorTelegramId: varchar("actor_telegram_id", { length: 320 }).notNull(),
    scope: varchar("scope", { length: 96 }).notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("processing"),
    resourceId: uuid("resource_id").references((): AnyPgColumn => contentItems.id, { onDelete: "set null" }),
    errorCode: varchar("error_code", { length: 96 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => ({
    actorScopeKeyIdx: uniqueIndex("idempotency_operations_actor_scope_key_idx").on(
      table.actorTelegramId,
      table.scope,
      table.idempotencyKey
    ),
    expiresIdx: index("idempotency_operations_expires_idx").on(table.expiresAt),
    resourceIdx: index("idempotency_operations_resource_idx").on(table.resourceId)
  })
);

export const clubSettings = pgTable("club_settings", {
  key: varchar("key", { length: 96 }).primaryKey(),
  value: text("value").notNull(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const authEmailLoginCodes = pgTable(
  "auth_email_login_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    emailCreatedIdx: index("auth_email_login_codes_email_created_idx").on(table.email, table.createdAt),
    codeHashIdx: index("auth_email_login_codes_code_hash_idx").on(table.codeHash)
  })
);

export const authEmailLoginAttemptLimits = pgTable("auth_email_login_attempt_limits", {
  scopeKey: varchar("scope_key", { length: 64 }).primaryKey(),
  scope: varchar("scope", { length: 24 }).notNull(),
  attemptCount: integer("attempt_count").notNull().default(1),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastIpAddress: varchar("last_ip_address", { length: 45 }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("auth_sessions_token_hash_idx").on(table.tokenHash),
    userIdx: index("auth_sessions_user_idx").on(table.userId, table.expiresAt),
    userLastSeenIdx: index("auth_sessions_user_last_seen_idx").on(table.userId, table.lastSeenAt)
  })
);

export const userLoginIps = pgTable(
  "user_login_ips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    ipAddress: varchar("ip_address", { length: 45 }).notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    loginCount: integer("login_count").notNull().default(1)
  },
  (table) => ({
    userIpIdx: uniqueIndex("user_login_ips_user_ip_idx").on(table.userId, table.ipAddress),
    userLastSeenIdx: index("user_login_ips_user_last_seen_idx").on(table.userId, table.lastSeenAt)
  })
);

export const userDevices = pgTable(
  "user_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    installationId: varchar("installation_id", { length: 64 }).notNull(),
    diagnostics: jsonb("diagnostics").$type<Record<string, unknown>>().notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userInstallationIdx: uniqueIndex("user_devices_user_installation_idx").on(table.userId, table.installationId),
    userLastSeenIdx: index("user_devices_user_last_seen_idx").on(table.userId, table.lastSeenAt)
  })
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    endpointIdx: uniqueIndex("push_subscriptions_endpoint_idx").on(table.endpoint),
    userIdx: index("push_subscriptions_user_idx").on(table.userId, table.revokedAt)
  })
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: membershipStatus("status").notNull().default("inactive"),
    provider: varchar("provider", { length: 32 }).notNull().default("manual"),
    providerPaymentId: varchar("provider_payment_id", { length: 128 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userStatusIdx: index("subscriptions_user_status_idx").on(table.userId, table.status),
    statusExpiresAtIdx: index("subscriptions_status_expires_at_idx").on(table.status, table.expiresAt)
  })
);

export const membershipExpiryReminderDeliveries = pgTable(
  "membership_expiry_reminder_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    stage: varchar("stage", { length: 24 }).notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("processing"),
    attemptCount: integer("attempt_count").notNull().default(1),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    subscriptionExpiryStageChannelIdx: uniqueIndex("membership_expiry_reminders_subscription_expiry_stage_channel_idx").on(
      table.subscriptionId,
      table.expiresAt,
      table.stage,
      table.channel
    ),
    statusRetryIdx: index("membership_expiry_reminders_status_retry_idx").on(table.status, table.nextAttemptAt, table.updatedAt),
    userIdx: index("membership_expiry_reminders_user_idx").on(table.userId, table.createdAt)
  })
);

export const paymentProviders = pgTable(
  "payment_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 32 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    formUrl: text("form_url").notNull(),
    secretKey: text("secret_key").notNull(),
    sys: varchar("sys", { length: 96 }).notNull(),
    apiKey: text("api_key"),
    webhookSecret: text("webhook_secret"),
    testBuyerEmail: varchar("test_buyer_email", { length: 320 }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastCheckError: text("last_check_error"),
    lastCatalogSyncAt: timestamp("last_catalog_sync_at", { withTimezone: true }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    providerIdx: uniqueIndex("payment_providers_provider_idx").on(table.provider)
  })
);

export const paymentProducts = pgTable(
  "payment_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id").notNull().references(() => paymentProviders.id, { onDelete: "cascade" }),
    kind: paymentProductKind("kind").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    badgeLabel: varchar("badge_label", { length: 32 }),
    amountRub: integer("amount_rub"),
    accessType: paymentAccessType("access_type").notNull().default("limited"),
    accessDays: integer("access_days"),
    prodamusSubscriptionId: varchar("prodamus_subscription_id", { length: 64 }),
    isPublished: boolean("is_published").notNull().default(false),
    archivedUntil: timestamp("archived_until", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    providerKindIdx: index("payment_products_provider_kind_idx").on(table.providerId, table.kind, table.isPublished),
    archivedIdx: index("payment_products_archived_idx").on(table.archivedUntil),
    validAccess: check(
      "payment_products_access_check",
      sql`(${table.accessType} = 'limited' and ${table.accessDays} between 1 and 3650) or (${table.accessType} = 'lifetime' and ${table.kind} = 'one_time' and ${table.accessDays} is null)`
    )
  })
);

export const paymentProductProviderBindings = pgTable(
  "payment_product_provider_bindings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").notNull().references(() => paymentProducts.id, { onDelete: "cascade" }),
    providerId: uuid("provider_id").notNull().references(() => paymentProviders.id, { onDelete: "cascade" }),
    externalProductId: varchar("external_product_id", { length: 160 }),
    externalOfferId: varchar("external_offer_id", { length: 160 }),
    isEnabled: boolean("is_enabled").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    productProviderIdx: uniqueIndex("payment_product_provider_bindings_product_provider_idx").on(table.productId, table.providerId),
    providerEnabledIdx: index("payment_product_provider_bindings_provider_enabled_idx").on(table.providerId, table.isEnabled)
  })
);

export const paymentProductProviderPrices = pgTable(
  "payment_product_provider_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bindingId: uuid("binding_id").notNull().references(() => paymentProductProviderBindings.id, { onDelete: "cascade" }),
    currency: paymentCurrency("currency").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    bindingCurrencyIdx: uniqueIndex("payment_product_provider_prices_binding_currency_idx").on(table.bindingId, table.currency),
    bindingEnabledIdx: index("payment_product_provider_prices_binding_enabled_idx").on(table.bindingId, table.isEnabled)
  })
);

export const paymentProviderCatalogItems = pgTable(
  "payment_provider_catalog_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id").notNull().references(() => paymentProviders.id, { onDelete: "cascade" }),
    externalProductId: varchar("external_product_id", { length: 160 }).notNull(),
    externalOfferId: varchar("external_offer_id", { length: 160 }).notNull().default(""),
    title: varchar("title", { length: 240 }).notNull(),
    kind: paymentProductKind("kind").notNull(),
    amountRub: integer("amount_rub"),
    isStale: boolean("is_stale").notNull().default(false),
    isSelectable: boolean("is_selectable").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    providerExternalIdx: uniqueIndex("payment_provider_catalog_items_provider_external_idx")
      .on(table.providerId, table.externalProductId, table.externalOfferId),
    providerStaleIdx: index("payment_provider_catalog_items_provider_stale_idx").on(table.providerId, table.isStale),
    providerSelectableIdx: index("payment_provider_catalog_items_provider_selectable_idx")
      .on(table.providerId, table.isSelectable, table.isStale)
  })
);

export const paymentProviderCatalogItemPrices = pgTable(
  "payment_provider_catalog_item_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    catalogItemId: uuid("catalog_item_id").notNull().references(() => paymentProviderCatalogItems.id, { onDelete: "cascade" }),
    currency: paymentCurrency("currency").notNull(),
    amountMinor: integer("amount_minor"),
    periodicity: varchar("periodicity", { length: 64 }).notNull().default("ONE_TIME"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    catalogItemCurrencyPeriodicityIdx: uniqueIndex("payment_provider_catalog_item_prices_catalog_item_currency_periodicity_idx")
      .on(table.catalogItemId, table.currency, table.periodicity)
  })
);

export const individualPaymentOffers = pgTable(
  "individual_payment_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    providerId: uuid("provider_id").notNull().references(() => paymentProviders.id, { onDelete: "restrict" }),
    provider: varchar("provider", { length: 16 }).notNull(),
    kind: paymentProductKind("kind").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    currency: paymentCurrency("currency").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    accessType: paymentAccessType("access_type").notNull().default("limited"),
    accessDays: integer("access_days"),
    externalProductId: varchar("external_product_id", { length: 160 }),
    externalOfferId: varchar("external_offer_id", { length: 160 }),
    catalogSnapshot: jsonb("catalog_snapshot").$type<Record<string, unknown> | null>(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
    checkoutStartedAt: timestamp("checkout_started_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("individual_payment_offers_token_hash_unique").on(table.tokenHash),
    userCreatedIdx: index("individual_payment_offers_user_created_idx").on(table.userId, table.createdAt),
    statusExpiresIdx: index("individual_payment_offers_status_expires_idx").on(table.status, table.expiresAt),
    userRecurrentOpenIdx: uniqueIndex("individual_payment_offers_user_recurrent_open_unique")
      .on(table.userId)
      .where(sql`${table.kind} = 'recurrent' and ${table.status} in ('active', 'checkout_pending')`),
    validStatus: check(
      "individual_payment_offers_status_check",
      sql`${table.status} in ('active', 'checkout_pending', 'paid', 'expired', 'cancelled')`
    ),
    positiveAmount: check("individual_payment_offers_amount_check", sql`${table.amountMinor} > 0`),
    validAccess: check(
      "individual_payment_offers_access_check",
      sql`(${table.accessType} = 'limited' and ${table.accessDays} between 1 and 3650) or (${table.accessType} = 'lifetime' and ${table.kind} = 'one_time' and ${table.accessDays} is null)`
    )
  })
);

export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => paymentProducts.id, { onDelete: "restrict" }),
    individualOfferId: uuid("individual_offer_id").references(() => individualPaymentOffers.id, { onDelete: "restrict" }),
    providerId: uuid("provider_id").notNull().references(() => paymentProviders.id, { onDelete: "restrict" }),
    status: paymentOrderStatus("status").notNull().default("pending"),
    amountRub: integer("amount_rub"),
    currency: paymentCurrency("currency").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    providerOrderId: varchar("provider_order_id", { length: 128 }).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 128 }),
    externalOrderId: varchar("external_order_id", { length: 160 }),
    checkoutUrl: text("checkout_url"),
    externalSubscriptionId: varchar("external_subscription_id", { length: 160 }),
    productTitleSnapshot: varchar("product_title_snapshot", { length: 180 }),
    productKindSnapshot: paymentProductKind("product_kind_snapshot"),
    accessTypeSnapshot: paymentAccessType("access_type_snapshot"),
    accessDaysSnapshot: integer("access_days_snapshot"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    providerOrderIdx: uniqueIndex("payment_orders_provider_order_idx").on(table.providerOrderId),
    userStatusIdx: index("payment_orders_user_status_idx").on(table.userId, table.status),
    createdAtIdx: index("payment_orders_created_at_idx").on(table.createdAt),
    statusCreatedAtIdx: index("payment_orders_status_created_at_idx").on(table.status, table.createdAt),
    offerPendingIdx: uniqueIndex("payment_orders_offer_pending_unique")
      .on(table.individualOfferId)
      .where(sql`${table.status} = 'pending'`),
    productOrOffer: check(
      "payment_orders_product_or_offer_check",
      sql`(${table.productId} is not null and ${table.individualOfferId} is null) or (${table.productId} is null and ${table.individualOfferId} is not null and ${table.productTitleSnapshot} is not null and ${table.productKindSnapshot} is not null and ${table.accessTypeSnapshot} is not null and ((${table.accessTypeSnapshot} = 'limited' and ${table.accessDaysSnapshot} is not null) or (${table.accessTypeSnapshot} = 'lifetime' and ${table.accessDaysSnapshot} is null)))`
    )
  })
);

export const userRecurrentSubscriptions = pgTable(
  "user_recurrent_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => paymentProducts.id, { onDelete: "restrict" }),
    individualOfferId: uuid("individual_offer_id").references(() => individualPaymentOffers.id, { onDelete: "restrict" }),
    providerId: uuid("provider_id").notNull().references(() => paymentProviders.id, { onDelete: "restrict" }),
    status: recurrentSubscriptionStatus("status").notNull().default("active"),
    prodamusSubscriptionId: varchar("prodamus_subscription_id", { length: 64 }),
    externalSubscriptionId: varchar("external_subscription_id", { length: 160 }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userProductIdx: uniqueIndex("user_recurrent_subscriptions_user_product_idx").on(table.userId, table.productId),
    userOfferIdx: uniqueIndex("user_recurrent_subscriptions_user_offer_idx").on(table.userId, table.individualOfferId),
    userStatusIdx: index("user_recurrent_subscriptions_user_status_idx").on(table.userId, table.status),
    productOrOffer: check(
      "user_recurrent_subscriptions_product_or_offer_check",
      sql`(${table.productId} is not null and ${table.individualOfferId} is null) or (${table.productId} is null and ${table.individualOfferId} is not null)`
    )
  })
);

export const referralCodes = pgTable(
  "referral_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdx: uniqueIndex("referral_codes_user_idx").on(table.userId),
    codeIdx: uniqueIndex("referral_codes_code_idx").on(table.code)
  })
);

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inviterUserId: uuid("inviter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    invitedUserId: uuid("invited_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    firstPaidAt: timestamp("first_paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    invitedUserIdx: uniqueIndex("referrals_invited_user_idx").on(table.invitedUserId),
    inviterCreatedIdx: index("referrals_inviter_created_idx").on(table.inviterUserId, table.createdAt),
    firstPaidIdx: index("referrals_first_paid_idx").on(table.firstPaidAt)
  })
);

export const referralRewards = pgTable(
  "referral_rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referralId: uuid("referral_id").notNull().references(() => referrals.id, { onDelete: "cascade" }),
    inviterUserId: uuid("inviter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    invitedUserId: uuid("invited_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    paymentOrderId: uuid("payment_order_id").references(() => paymentOrders.id, { onDelete: "set null" }),
    bonusDays: integer("bonus_days").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("available"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    referralIdx: uniqueIndex("referral_rewards_referral_idx").on(table.referralId),
    paymentOrderIdx: uniqueIndex("referral_rewards_payment_order_idx").on(table.paymentOrderId),
    inviterStatusIdx: index("referral_rewards_inviter_status_idx").on(table.inviterUserId, table.status)
  })
);

export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id").references(() => paymentProviders.id, { onDelete: "set null" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    eventKey: varchar("event_key", { length: 180 }).notNull(),
    isValid: boolean("is_valid").notNull().default(false),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    eventKeyIdx: uniqueIndex("payment_webhook_events_event_key_idx").on(table.provider, table.eventKey)
  })
);

export const contentCategories = pgTable(
  "content_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 96 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    archivedUntil: timestamp("archived_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    slugIdx: uniqueIndex("content_categories_slug_idx").on(table.slug),
    publishedSortIdx: index("content_categories_published_sort_idx").on(table.isPublished, table.sortOrder),
    archiveIdx: index("content_categories_archive_idx").on(table.archivedUntil)
  })
);

export const contentItems = pgTable(
  "content_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id").notNull().references(() => contentCategories.id, { onDelete: "cascade" }),
    kind: contentKind("kind").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    summary: text("summary"),
    body: text("body"),
    mediaUrl: text("media_url"),
    mediaObjectKey: text("media_object_key"),
    thumbnailUrl: text("thumbnail_url"),
    coverMode: varchar("cover_mode", { length: 24 }).notNull().default("default"),
    cardLayout: varchar("card_layout", { length: 24 }).notNull().default("vertical"),
    thumbnailObjectKey: text("thumbnail_object_key"),
    thumbnailContentType: varchar("thumbnail_content_type", { length: 160 }),
    thumbnailSizeBytes: integer("thumbnail_size_bytes"),
    mediaContentType: varchar("media_content_type", { length: 160 }),
    mediaSizeBytes: integer("media_size_bytes"),
    assessmentMode: varchar("assessment_mode", { length: 16 }).notNull().default("none"),
    publishedAssessmentRevisionId: uuid("published_assessment_revision_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedUntil: timestamp("archived_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    categoryPublishedIdx: index("content_items_category_published_idx").on(
      table.categoryId,
      table.isPublished,
      table.sortOrder
    )
  })
);

export const lessonMaterials = pgTable(
  "lesson_materials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    kind: contentKind("kind").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    body: text("body"),
    mediaUrl: text("media_url"),
    mediaObjectKey: text("media_object_key"),
    mediaContentType: varchar("media_content_type", { length: 160 }),
    mediaSizeBytes: integer("media_size_bytes"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    itemSortIdx: index("lesson_materials_item_sort_idx").on(table.contentItemId, table.sortOrder)
  })
);

export const lessonAssessmentRevisions = pgTable(
  "lesson_assessment_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    mode: varchar("mode", { length: 16 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    title: varchar("title", { length: 180 }).notNull(),
    instructions: text("instructions"),
    passingPercent: integer("passing_percent"),
    maxAttempts: integer("max_attempts"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    allowText: boolean("allow_text"),
    allowAttachments: boolean("allow_attachments"),
    allowedFileKinds: jsonb("allowed_file_kinds").$type<Array<"image" | "document" | "video">>(),
    maxAttachments: integer("max_attachments"),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    lessonRevisionIdx: uniqueIndex("lesson_assessment_revisions_lesson_revision_unique").on(table.contentItemId, table.revision),
    lessonStatusIdx: index("lesson_assessment_revisions_lesson_status_idx").on(table.contentItemId, table.status),
    modeCheck: check("lesson_assessment_revisions_mode_check", sql`${table.mode} in ('quiz', 'homework')`),
    statusCheck: check("lesson_assessment_revisions_status_check", sql`${table.status} in ('draft', 'published', 'superseded')`)
  })
);

export const lessonAssessmentQuestions = pgTable(
  "lesson_assessment_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revisionId: uuid("revision_id").notNull().references(() => lessonAssessmentRevisions.id, { onDelete: "cascade" }),
    stableKey: varchar("stable_key", { length: 96 }).notNull(),
    type: varchar("type", { length: 24 }).notNull(),
    prompt: text("prompt").notNull(),
    points: integer("points").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    revisionKeyIdx: uniqueIndex("lesson_assessment_questions_revision_key_unique").on(table.revisionId, table.stableKey),
    revisionSortIdx: index("lesson_assessment_questions_revision_sort_idx").on(table.revisionId, table.sortOrder),
    typeCheck: check("lesson_assessment_questions_type_check", sql`${table.type} in ('single_choice', 'multiple_choice', 'free_text')`),
    pointsCheck: check("lesson_assessment_questions_points_check", sql`${table.points} > 0`)
  })
);

export const lessonAssessmentOptions = pgTable(
  "lesson_assessment_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id").notNull().references(() => lessonAssessmentQuestions.id, { onDelete: "cascade" }),
    stableKey: varchar("stable_key", { length: 96 }).notNull(),
    text: text("text").notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    questionKeyIdx: uniqueIndex("lesson_assessment_options_question_key_unique").on(table.questionId, table.stableKey),
    questionSortIdx: index("lesson_assessment_options_question_sort_idx").on(table.questionId, table.sortOrder)
  })
);

export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id").notNull().references(() => lessonAssessmentRevisions.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("in_progress"),
    earnedPoints: integer("earned_points"),
    maxPoints: integer("max_points"),
    percent: integer("percent"),
    submissionKey: varchar("submission_key", { length: 128 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userLessonAttemptIdx: uniqueIndex("quiz_attempts_user_lesson_number_unique").on(table.userId, table.contentItemId, table.attemptNumber),
    userLessonOpenIdx: uniqueIndex("quiz_attempts_user_lesson_open_unique").on(table.userId, table.contentItemId).where(sql`${table.status} = 'in_progress'`),
    submissionKeyIdx: uniqueIndex("quiz_attempts_submission_key_unique").on(table.submissionKey),
    reviewQueueIdx: index("quiz_attempts_review_queue_idx").on(table.status, table.submittedAt),
    statusCheck: check("quiz_attempts_status_check", sql`${table.status} in ('in_progress', 'pending_review', 'passed', 'failed')`)
  })
);

export const quizAttemptQuestions = pgTable(
  "quiz_attempt_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id").notNull().references(() => quizAttempts.id, { onDelete: "cascade" }),
    sourceQuestionId: uuid("source_question_id").references(() => lessonAssessmentQuestions.id, { onDelete: "set null" }),
    questionKey: varchar("question_key", { length: 96 }).notNull(),
    type: varchar("type", { length: 24 }).notNull(),
    prompt: text("prompt").notNull(),
    points: integer("points").notNull(),
    optionsSnapshot: jsonb("options_snapshot").$type<Array<{ id: string; text: string }>>().notNull().default([]),
    correctOptionIds: jsonb("correct_option_ids").$type<string[]>().notNull().default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    attemptKeyIdx: uniqueIndex("quiz_attempt_questions_attempt_key_unique").on(table.attemptId, table.questionKey),
    attemptSortIdx: index("quiz_attempt_questions_attempt_sort_idx").on(table.attemptId, table.sortOrder)
  })
);

export const quizAnswers = pgTable(
  "quiz_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id").notNull().references(() => quizAttempts.id, { onDelete: "cascade" }),
    questionSnapshotId: uuid("question_snapshot_id").notNull().references(() => quizAttemptQuestions.id, { onDelete: "cascade" }),
    selectedOptionIds: jsonb("selected_option_ids").$type<string[]>().notNull().default([]),
    text: text("text"),
    reviewedPoints: integer("reviewed_points"),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    attemptQuestionIdx: uniqueIndex("quiz_answers_attempt_question_unique").on(table.attemptId, table.questionSnapshotId)
  })
);

export const homeworkSubmissions = pgTable(
  "homework_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    revisionId: uuid("revision_id").notNull().references(() => lessonAssessmentRevisions.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    text: text("text"),
    submissionKey: varchar("submission_key", { length: 128 }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    resetAt: timestamp("reset_at", { withTimezone: true }),
    resetByUserId: uuid("reset_by_user_id").references(() => users.id, { onDelete: "set null" }),
    resetReason: text("reset_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userLessonVersionIdx: uniqueIndex("homework_submissions_user_lesson_version_unique").on(table.userId, table.contentItemId, table.version),
    submissionKeyIdx: uniqueIndex("homework_submissions_submission_key_unique").on(table.submissionKey),
    reviewQueueIdx: index("homework_submissions_review_queue_idx").on(table.status, table.submittedAt),
    statusCheck: check("homework_submissions_status_check", sql`${table.status} in ('draft', 'pending_review', 'needs_revision', 'accepted')`)
  })
);

export const homeworkAttachments = pgTable(
  "homework_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id").notNull().references(() => homeworkSubmissions.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    contentType: varchar("content_type", { length: 160 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    objectKeyIdx: uniqueIndex("homework_attachments_object_key_unique").on(table.objectKey),
    submissionIdx: index("homework_attachments_submission_idx").on(table.submissionId),
    unconfirmedIdx: index("homework_attachments_unconfirmed_idx").on(table.confirmedAt, table.createdAt)
  })
);

export const assessmentReviews = pgTable(
  "assessment_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizAttemptId: uuid("quiz_attempt_id").references(() => quizAttempts.id, { onDelete: "cascade" }),
    homeworkSubmissionId: uuid("homework_submission_id").references(() => homeworkSubmissions.id, { onDelete: "cascade" }),
    reviewedByUserId: uuid("reviewed_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    decision: varchar("decision", { length: 24 }).notNull(),
    comment: text("comment"),
    questionPoints: jsonb("question_points").$type<Record<string, number>>(),
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    idempotencyIdx: uniqueIndex("assessment_reviews_idempotency_key_unique").on(table.idempotencyKey),
    quizAttemptIdx: uniqueIndex("assessment_reviews_quiz_attempt_unique").on(table.quizAttemptId),
    homeworkSubmissionIdx: uniqueIndex("assessment_reviews_homework_submission_unique").on(table.homeworkSubmissionId),
    oneTargetCheck: check("assessment_reviews_one_target_check", sql`num_nonnulls(${table.quizAttemptId}, ${table.homeworkSubmissionId}) = 1`)
  })
);

export const homeworkReviewDismissals = pgTable(
  "homework_review_dismissals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    homeworkSubmissionId: uuid("homework_submission_id").notNull().references(() => homeworkSubmissions.id, { onDelete: "cascade" }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userSubmissionIdx: uniqueIndex("homework_review_dismissals_user_submission_unique").on(table.userId, table.homeworkSubmissionId),
    userDismissedIdx: index("homework_review_dismissals_user_dismissed_idx").on(table.userId, table.dismissedAt)
  })
);

export const quizAttemptResets = pgTable(
  "quiz_attempt_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizAttemptId: uuid("quiz_attempt_id").references(() => quizAttempts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    resetByUserId: uuid("reset_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    quizAttemptIdx: uniqueIndex("quiz_attempt_resets_quiz_attempt_unique").on(table.quizAttemptId),
    userLessonCreatedIdx: index("quiz_attempt_resets_user_lesson_created_idx").on(table.userId, table.contentItemId, table.createdAt)
  })
);

export const userContentProgress = pgTable(
  "user_content_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    lastOpenedMaterialId: uuid("last_opened_material_id").references(() => lessonMaterials.id, { onDelete: "set null" }),
    playbackPositionSeconds: integer("playback_position_seconds").notNull().default(0),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userItemIdx: uniqueIndex("user_content_progress_user_item_idx").on(table.userId, table.contentItemId),
    userLastOpenedIdx: index("user_content_progress_user_last_opened_idx").on(table.userId, table.lastOpenedAt),
    userLastMaterialIdx: index("user_content_progress_last_material_idx").on(table.lastOpenedMaterialId),
    userCompletedIdx: index("user_content_progress_user_completed_idx").on(table.userId, table.completedAt)
  })
);

export const userLearningFavorites = pgTable(
  "user_learning_favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userItemIdx: uniqueIndex("user_learning_favorites_user_item_unique").on(table.userId, table.contentItemId),
    userCreatedIdx: index("user_learning_favorites_user_created_idx").on(table.userId, table.createdAt)
  })
);

export const learningEngagementSessions = pgTable(
  "learning_engagement_sessions",
  {
    sessionId: uuid("session_id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    materialId: uuid("material_id").references(() => lessonMaterials.id, { onDelete: "set null" }),
    activeSeconds: integer("active_seconds").notNull().default(0),
    videoSeconds: integer("video_seconds").notNull().default(0),
    playbackPositionSeconds: integer("playback_position_seconds").notNull().default(0),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    contentActivityIdx: index("learning_engagement_content_activity_idx").on(table.contentItemId, table.lastActivityAt),
    userActivityIdx: index("learning_engagement_user_activity_idx").on(table.userId, table.lastActivityAt)
  })
);

export const lessonComments = pgTable(
  "lesson_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    status: moderationStatus("status").notNull().default("visible"),
    moderatedByUserId: uuid("moderated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    moderationReason: text("moderation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    itemStatusCreatedIdx: index("lesson_comments_item_status_created_idx").on(
      table.contentItemId,
      table.status,
      table.createdAt
    ),
    userCreatedIdx: index("lesson_comments_user_created_idx").on(table.userId, table.createdAt)
  })
);

export const userMutes = pgTable(
  "user_mutes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: muteKind("kind").notNull(),
    reason: text("reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userActiveIdx: index("user_mutes_user_active_idx").on(table.userId, table.revokedAt, table.expiresAt),
    createdIdx: index("user_mutes_created_idx").on(table.createdAt)
  })
);

export const clubChats = pgTable(
  "club_chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 96 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    description: text("description"),
    isPublished: boolean("is_published").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    slugIdx: uniqueIndex("club_chats_slug_idx").on(table.slug),
    publishedSortIdx: index("club_chats_published_sort_idx").on(table.isPublished, table.sortOrder)
  })
);

export const clubChatTopics = pgTable(
  "club_chat_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id").notNull().references(() => clubChats.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    isPinned: boolean("is_pinned").notNull().default(false),
    isLocked: boolean("is_locked").notNull().default(false),
    isPublished: boolean("is_published").notNull().default(true),
    isAdminOnly: boolean("is_admin_only").notNull().default(false),
    archivedUntil: timestamp("archived_until", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    chatPinnedCreatedIdx: index("club_chat_topics_chat_pinned_created_idx").on(
      table.chatId,
      table.isPublished,
      table.isPinned,
      table.createdAt
    )
  })
);

export const clubChatMessages = pgTable(
  "club_chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topicId: uuid("topic_id").notNull().references(() => clubChatTopics.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    replyToMessageId: uuid("reply_to_message_id").references((): AnyPgColumn => clubChatMessages.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    kind: varchar("kind", { length: 16 }).notNull().default("text"),
    isSystem: boolean("is_system").notNull().default(false),
    status: moderationStatus("status").notNull().default("visible"),
    moderatedByUserId: uuid("moderated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    moderationReason: text("moderation_reason"),
    pinnedAt: timestamp("pinned_at", { withTimezone: true }),
    pinnedByUserId: uuid("pinned_by_user_id").references(() => users.id, { onDelete: "set null" }),
    purgeAt: timestamp("purge_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    topicStatusCreatedIdx: index("club_chat_messages_topic_status_created_idx").on(
      table.topicId,
      table.status,
      table.createdAt
    ),
    userCreatedIdx: index("club_chat_messages_user_created_idx").on(table.userId, table.createdAt),
    topicPinnedIdx: index("club_chat_messages_topic_pinned_idx").on(table.topicId, table.pinnedAt),
    createdAtIdx: index("club_chat_messages_created_at_idx").on(table.createdAt)
  })
);

export const clubMessageAttachments = pgTable(
  "club_message_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").notNull().references(() => clubChatMessages.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).notNull(),
    objectKey: text("object_key").notNull(),
    contentType: varchar("content_type", { length: 160 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    durationSeconds: integer("duration_seconds"),
    width: integer("width"),
    height: integer("height"),
    sortOrder: integer("sort_order").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    messageSortIdx: index("club_message_attachments_message_sort_idx").on(table.messageId, table.sortOrder),
    expiryIdx: index("club_message_attachments_expiry_idx").on(table.expiresAt, table.deletedAt)
  })
);

export const clubPolls = pgTable(
  "club_polls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").notNull().references(() => clubChatMessages.id, { onDelete: "cascade" }),
    question: varchar("question", { length: 500 }).notNull(),
    allowsMultiple: boolean("allows_multiple").notNull().default(false),
    isAnonymous: boolean("is_anonymous").notNull().default(true),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    messageIdx: uniqueIndex("club_polls_message_idx").on(table.messageId),
    createdAtIdx: index("club_polls_created_at_idx").on(table.createdAt)
  })
);

export const clubPollOptions = pgTable(
  "club_poll_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id").notNull().references(() => clubPolls.id, { onDelete: "cascade" }),
    text: varchar("text", { length: 300 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({ pollSortIdx: index("club_poll_options_poll_sort_idx").on(table.pollId, table.sortOrder) })
);

export const clubPollVotes = pgTable(
  "club_poll_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id").notNull().references(() => clubPolls.id, { onDelete: "cascade" }),
    optionId: uuid("option_id").notNull().references(() => clubPollOptions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pollUserOptionIdx: uniqueIndex("club_poll_votes_poll_user_option_idx").on(table.pollId, table.userId, table.optionId),
    pollIdx: index("club_poll_votes_poll_idx").on(table.pollId)
  })
);

export const clubMessageReactions = pgTable(
  "club_message_reactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id").notNull().references(() => clubChatMessages.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reaction: messageReaction("reaction").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    messageUserIdx: uniqueIndex("club_message_reactions_message_user_idx").on(table.messageId, table.userId),
    messageReactionIdx: index("club_message_reactions_message_reaction_idx").on(table.messageId, table.reaction)
  })
);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    topic: varchar("topic", { length: 96 }).notNull(),
    customTopic: varchar("custom_topic", { length: 160 }),
    message: text("message").notNull(),
    status: supportTicketStatus("status").notNull().default("open"),
    lastCustomerMessageAt: timestamp("last_customer_message_at", { withTimezone: true }).notNull().defaultNow(),
    lastAdminMessageAt: timestamp("last_admin_message_at", { withTimezone: true }),
    customerReadAt: timestamp("customer_read_at", { withTimezone: true }).notNull().defaultNow(),
    adminReadAt: timestamp("admin_read_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userStatusIdx: index("support_tickets_user_status_idx").on(table.userId, table.status)
  })
);

export const supportTicketMessages = pgTable(
  "support_ticket_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    authorRole: varchar("author_role", { length: 16 }).notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    ticketCreatedIdx: index("support_ticket_messages_ticket_created_idx").on(table.ticketId, table.createdAt)
  })
);

export const supportTicketAttachments = pgTable(
  "support_ticket_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id").notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").notNull().references(() => supportTicketMessages.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    objectKey: text("object_key").notNull(),
    contentType: varchar("content_type", { length: 120 }).notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    ticketIdx: index("support_ticket_attachments_ticket_idx").on(table.ticketId),
    objectKeyIdx: uniqueIndex("support_ticket_attachments_object_key_idx").on(table.objectKey),
    expiresAtIdx: index("support_ticket_attachments_expires_at_idx").on(table.expiresAt)
  })
);

export const appNotifications = pgTable(
  "app_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull().default("system"),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    bodyHtml: text("body_html"),
    source: varchar("source", { length: 64 }),
    sourceId: uuid("source_id"),
    attachmentKind: varchar("attachment_kind", { length: 16 }),
    attachmentFileName: varchar("attachment_file_name", { length: 255 }),
    attachmentObjectKey: text("attachment_object_key"),
    attachmentContentType: varchar("attachment_content_type", { length: 160 }),
    attachmentSizeBytes: integer("attachment_size_bytes"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userReadCreatedIdx: index("app_notifications_user_read_created_idx").on(table.userId, table.readAt, table.createdAt),
    sourceIdx: index("app_notifications_source_idx").on(table.source, table.sourceId),
    assessmentResetUniqueIdx: uniqueIndex("app_notifications_assessment_reset_unique").on(table.userId, table.source, table.sourceId).where(sql`${table.source} = 'lesson_assessment_reset'`)
  })
);

export const adminMailings = pgTable(
  "admin_mailings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    bodyHtml: text("body_html"),
    channel: varchar("channel", { length: 16 }).notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    attachmentKind: varchar("attachment_kind", { length: 16 }),
    attachmentFileName: varchar("attachment_file_name", { length: 255 }),
    attachmentObjectKey: text("attachment_object_key"),
    attachmentContentType: varchar("attachment_content_type", { length: 160 }),
    attachmentSizeBytes: integer("attachment_size_bytes"),
    telegramFileId: text("telegram_file_id"),
    estimatedSeconds: integer("estimated_seconds").notNull().default(0),
    targetCount: integer("target_count").notNull().default(0),
    deliveryCount: integer("delivery_count").notNull().default(0),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    analyticsEnabledAt: timestamp("analytics_enabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    statusScheduledIdx: index("admin_mailings_status_scheduled_idx").on(table.status, table.scheduledAt, table.createdAt),
    createdIdx: index("admin_mailings_created_idx").on(table.createdAt)
  })
);

export const adminMailingRecipients = pgTable(
  "admin_mailing_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mailingId: uuid("mailing_id").notNull().references(() => adminMailings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    telegramId: varchar("telegram_id", { length: 320 }).notNull(),
    channel: varchar("channel", { length: 16 }).notNull().default("push"),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    error: text("error"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    mailingStatusIdx: index("admin_mailing_recipients_mailing_status_idx").on(table.mailingId, table.status, table.createdAt),
    retryIdx: index("admin_mailing_recipients_retry_idx").on(table.status, table.nextAttemptAt, table.updatedAt),
    userIdx: index("admin_mailing_recipients_user_idx").on(table.userId),
    mailingUserChannelIdx: uniqueIndex("admin_mailing_recipients_mailing_user_channel_idx").on(table.mailingId, table.userId, table.channel)
  })
);

export const adminMailingEvents = pgTable(
  "admin_mailing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mailingId: uuid("mailing_id").notNull().references(() => adminMailings.id, { onDelete: "cascade" }),
    recipientId: uuid("recipient_id").notNull().references(() => adminMailingRecipients.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 16 }).notNull(),
    eventKey: varchar("event_key", { length: 80 }).notNull(),
    destination: text("destination"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    recipientKeyIdx: uniqueIndex("admin_mailing_events_recipient_key_idx").on(table.recipientId, table.eventKey),
    mailingTypeTimeIdx: index("admin_mailing_events_mailing_type_time_idx").on(table.mailingId, table.eventType, table.occurredAt),
    mailingTimeIdx: index("admin_mailing_events_mailing_time_idx").on(table.mailingId, table.occurredAt)
  })
);

export const emailDeliveryLog = pgTable(
  "email_delivery_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: varchar("category", { length: 32 }).notNull(),
    recipientCount: integer("recipient_count").notNull().default(1),
    status: varchar("status", { length: 16 }).notNull().default("processing"),
    messageId: text("message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    statusCreatedIdx: index("email_delivery_log_status_created_idx").on(table.status, table.createdAt),
    createdIdx: index("email_delivery_log_created_idx").on(table.createdAt)
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  authSessions: many(authSessions),
  loginIps: many(userLoginIps),
  devices: many(userDevices),
  pushSubscriptions: many(pushSubscriptions),
  subscriptions: many(subscriptions),
  paymentOrders: many(paymentOrders),
  individualPaymentOffers: many(individualPaymentOffers, { relationName: "individual_offer_recipient" }),
  createdIndividualPaymentOffers: many(individualPaymentOffers, { relationName: "individual_offer_creator" }),
  recurrentSubscriptions: many(userRecurrentSubscriptions),
  referralCodes: many(referralCodes),
  invitedReferrals: many(referrals, { relationName: "referral_inviter" }),
  referralSource: many(referrals, { relationName: "referral_invited" }),
  referralRewards: many(referralRewards, { relationName: "referral_reward_inviter" }),
  referralRewardSources: many(referralRewards, { relationName: "referral_reward_invited" }),
  supportTickets: many(supportTickets, { relationName: "support_ticket_customer" }),
  closedSupportTickets: many(supportTickets, { relationName: "support_ticket_closer" }),
  supportMessages: many(supportTicketMessages),
  createdAdminUsers: many(adminUsers),
  adminActionLogs: many(adminActionLogs, { relationName: "admin_action_actor" }),
  targetedAdminActionLogs: many(adminActionLogs, { relationName: "admin_action_target" }),
  contentProgress: many(userContentProgress),
  learningFavorites: many(userLearningFavorites),
  lessonComments: many(lessonComments),
  mutes: many(userMutes),
  chatMessages: many(clubChatMessages),
  notifications: many(appNotifications),
  createdMailings: many(adminMailings),
  mailingRecipients: many(adminMailingRecipients)
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, {
    fields: [authSessions.userId],
    references: [users.id]
  })
}));

export const userLoginIpsRelations = relations(userLoginIps, ({ one }) => ({
  user: one(users, {
    fields: [userLoginIps.userId],
    references: [users.id]
  })
}));

export const userDevicesRelations = relations(userDevices, ({ one }) => ({
  user: one(users, {
    fields: [userDevices.userId],
    references: [users.id]
  })
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id]
  })
}));

export const adminUsersRelations = relations(adminUsers, ({ one }) => ({
  createdBy: one(users, {
    fields: [adminUsers.createdByUserId],
    references: [users.id]
  })
}));

export const adminActionLogsRelations = relations(adminActionLogs, ({ one }) => ({
  actor: one(users, {
    fields: [adminActionLogs.actorUserId],
    references: [users.id],
    relationName: "admin_action_actor"
  }),
  targetUser: one(users, {
    fields: [adminActionLogs.targetUserId],
    references: [users.id],
    relationName: "admin_action_target"
  })
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id]
  })
}));

export const paymentProvidersRelations = relations(paymentProviders, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [paymentProviders.createdByUserId],
    references: [users.id]
  }),
  products: many(paymentProducts),
  productBindings: many(paymentProductProviderBindings),
  catalogItems: many(paymentProviderCatalogItems),
  individualOffers: many(individualPaymentOffers),
  orders: many(paymentOrders),
  recurrentSubscriptions: many(userRecurrentSubscriptions)
}));

export const paymentProductsRelations = relations(paymentProducts, ({ one, many }) => ({
  provider: one(paymentProviders, {
    fields: [paymentProducts.providerId],
    references: [paymentProviders.id]
  }),
  providerBindings: many(paymentProductProviderBindings),
  orders: many(paymentOrders),
  recurrentSubscriptions: many(userRecurrentSubscriptions)
}));

export const paymentProductProviderBindingsRelations = relations(paymentProductProviderBindings, ({ one, many }) => ({
  product: one(paymentProducts, {
    fields: [paymentProductProviderBindings.productId],
    references: [paymentProducts.id]
  }),
  provider: one(paymentProviders, {
    fields: [paymentProductProviderBindings.providerId],
    references: [paymentProviders.id]
  }),
  prices: many(paymentProductProviderPrices)
}));

export const paymentProductProviderPricesRelations = relations(paymentProductProviderPrices, ({ one }) => ({
  binding: one(paymentProductProviderBindings, {
    fields: [paymentProductProviderPrices.bindingId],
    references: [paymentProductProviderBindings.id]
  })
}));

export const paymentProviderCatalogItemsRelations = relations(paymentProviderCatalogItems, ({ one, many }) => ({
  provider: one(paymentProviders, {
    fields: [paymentProviderCatalogItems.providerId],
    references: [paymentProviders.id]
  }),
  prices: many(paymentProviderCatalogItemPrices)
}));

export const paymentProviderCatalogItemPricesRelations = relations(paymentProviderCatalogItemPrices, ({ one }) => ({
  catalogItem: one(paymentProviderCatalogItems, {
    fields: [paymentProviderCatalogItemPrices.catalogItemId],
    references: [paymentProviderCatalogItems.id]
  })
}));

export const individualPaymentOffersRelations = relations(individualPaymentOffers, ({ one, many }) => ({
  user: one(users, {
    fields: [individualPaymentOffers.userId],
    references: [users.id],
    relationName: "individual_offer_recipient"
  }),
  createdBy: one(users, {
    fields: [individualPaymentOffers.createdByUserId],
    references: [users.id],
    relationName: "individual_offer_creator"
  }),
  providerRecord: one(paymentProviders, {
    fields: [individualPaymentOffers.providerId],
    references: [paymentProviders.id]
  }),
  orders: many(paymentOrders),
  recurrentSubscriptions: many(userRecurrentSubscriptions)
}));

export const paymentOrdersRelations = relations(paymentOrders, ({ one }) => ({
  user: one(users, {
    fields: [paymentOrders.userId],
    references: [users.id]
  }),
  product: one(paymentProducts, {
    fields: [paymentOrders.productId],
    references: [paymentProducts.id]
  }),
  provider: one(paymentProviders, {
    fields: [paymentOrders.providerId],
    references: [paymentProviders.id]
  }),
  individualOffer: one(individualPaymentOffers, {
    fields: [paymentOrders.individualOfferId],
    references: [individualPaymentOffers.id]
  })
}));

export const userRecurrentSubscriptionsRelations = relations(userRecurrentSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [userRecurrentSubscriptions.userId],
    references: [users.id]
  }),
  product: one(paymentProducts, {
    fields: [userRecurrentSubscriptions.productId],
    references: [paymentProducts.id]
  }),
  individualOffer: one(individualPaymentOffers, {
    fields: [userRecurrentSubscriptions.individualOfferId],
    references: [individualPaymentOffers.id]
  }),
  provider: one(paymentProviders, {
    fields: [userRecurrentSubscriptions.providerId],
    references: [paymentProviders.id]
  })
}));

export const referralCodesRelations = relations(referralCodes, ({ one }) => ({
  user: one(users, {
    fields: [referralCodes.userId],
    references: [users.id]
  })
}));

export const referralsRelations = relations(referrals, ({ one, many }) => ({
  inviter: one(users, {
    fields: [referrals.inviterUserId],
    references: [users.id],
    relationName: "referral_inviter"
  }),
  invited: one(users, {
    fields: [referrals.invitedUserId],
    references: [users.id],
    relationName: "referral_invited"
  }),
  rewards: many(referralRewards)
}));

export const referralRewardsRelations = relations(referralRewards, ({ one }) => ({
  referral: one(referrals, {
    fields: [referralRewards.referralId],
    references: [referrals.id]
  }),
  inviter: one(users, {
    fields: [referralRewards.inviterUserId],
    references: [users.id],
    relationName: "referral_reward_inviter"
  }),
  invited: one(users, {
    fields: [referralRewards.invitedUserId],
    references: [users.id],
    relationName: "referral_reward_invited"
  }),
  paymentOrder: one(paymentOrders, {
    fields: [referralRewards.paymentOrderId],
    references: [paymentOrders.id]
  })
}));

export const paymentWebhookEventsRelations = relations(paymentWebhookEvents, ({ one }) => ({
  provider: one(paymentProviders, {
    fields: [paymentWebhookEvents.providerId],
    references: [paymentProviders.id]
  })
}));

export const contentCategoriesRelations = relations(contentCategories, ({ many }) => ({
  items: many(contentItems)
}));

export const contentItemsRelations = relations(contentItems, ({ one, many }) => ({
  category: one(contentCategories, {
    fields: [contentItems.categoryId],
    references: [contentCategories.id]
  }),
  comments: many(lessonComments),
  favorites: many(userLearningFavorites),
  materials: many(lessonMaterials)
}));

export const lessonMaterialsRelations = relations(lessonMaterials, ({ one }) => ({
  item: one(contentItems, {
    fields: [lessonMaterials.contentItemId],
    references: [contentItems.id]
  })
}));

export const userContentProgressRelations = relations(userContentProgress, ({ one }) => ({
  user: one(users, {
    fields: [userContentProgress.userId],
    references: [users.id]
  }),
  item: one(contentItems, {
    fields: [userContentProgress.contentItemId],
    references: [contentItems.id]
  }),
  lastOpenedMaterial: one(lessonMaterials, {
    fields: [userContentProgress.lastOpenedMaterialId],
    references: [lessonMaterials.id]
  })
}));

export const userLearningFavoritesRelations = relations(userLearningFavorites, ({ one }) => ({
  user: one(users, {
    fields: [userLearningFavorites.userId],
    references: [users.id]
  }),
  item: one(contentItems, {
    fields: [userLearningFavorites.contentItemId],
    references: [contentItems.id]
  })
}));

export const lessonCommentsRelations = relations(lessonComments, ({ one }) => ({
  item: one(contentItems, {
    fields: [lessonComments.contentItemId],
    references: [contentItems.id]
  }),
  user: one(users, {
    fields: [lessonComments.userId],
    references: [users.id]
  }),
  moderatedBy: one(users, {
    fields: [lessonComments.moderatedByUserId],
    references: [users.id]
  })
}));

export const userMutesRelations = relations(userMutes, ({ one }) => ({
  user: one(users, {
    fields: [userMutes.userId],
    references: [users.id]
  }),
  createdBy: one(users, {
    fields: [userMutes.createdByUserId],
    references: [users.id]
  }),
  revokedBy: one(users, {
    fields: [userMutes.revokedByUserId],
    references: [users.id]
  })
}));

export const clubChatsRelations = relations(clubChats, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [clubChats.createdByUserId],
    references: [users.id]
  }),
  topics: many(clubChatTopics)
}));

export const clubChatTopicsRelations = relations(clubChatTopics, ({ one, many }) => ({
  chat: one(clubChats, {
    fields: [clubChatTopics.chatId],
    references: [clubChats.id]
  }),
  createdBy: one(users, {
    fields: [clubChatTopics.createdByUserId],
    references: [users.id]
  }),
  messages: many(clubChatMessages)
}));

export const clubChatMessagesRelations = relations(clubChatMessages, ({ one, many }) => ({
  topic: one(clubChatTopics, {
    fields: [clubChatMessages.topicId],
    references: [clubChatTopics.id]
  }),
  user: one(users, {
    fields: [clubChatMessages.userId],
    references: [users.id]
  }),
  moderatedBy: one(users, {
    fields: [clubChatMessages.moderatedByUserId],
    references: [users.id]
  }),
  replyToMessage: one(clubChatMessages, {
    fields: [clubChatMessages.replyToMessageId],
    references: [clubChatMessages.id],
    relationName: "message_replies"
  }),
  attachments: many(clubMessageAttachments),
  polls: many(clubPolls)
}));

export const clubMessageAttachmentsRelations = relations(clubMessageAttachments, ({ one }) => ({
  message: one(clubChatMessages, { fields: [clubMessageAttachments.messageId], references: [clubChatMessages.id] })
}));

export const clubPollsRelations = relations(clubPolls, ({ one, many }) => ({
  message: one(clubChatMessages, { fields: [clubPolls.messageId], references: [clubChatMessages.id] }),
  options: many(clubPollOptions),
  votes: many(clubPollVotes)
}));

export const clubPollOptionsRelations = relations(clubPollOptions, ({ one, many }) => ({
  poll: one(clubPolls, { fields: [clubPollOptions.pollId], references: [clubPolls.id] }),
  votes: many(clubPollVotes)
}));

export const clubPollVotesRelations = relations(clubPollVotes, ({ one }) => ({
  poll: one(clubPolls, { fields: [clubPollVotes.pollId], references: [clubPolls.id] }),
  option: one(clubPollOptions, { fields: [clubPollVotes.optionId], references: [clubPollOptions.id] }),
  user: one(users, { fields: [clubPollVotes.userId], references: [users.id] })
}));

export const clubMessageReactionsRelations = relations(clubMessageReactions, ({ one }) => ({
  message: one(clubChatMessages, {
    fields: [clubMessageReactions.messageId],
    references: [clubChatMessages.id]
  }),
  user: one(users, {
    fields: [clubMessageReactions.userId],
    references: [users.id]
  })
}));

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  user: one(users, {
    fields: [supportTickets.userId],
    references: [users.id],
    relationName: "support_ticket_customer"
  }),
  closedBy: one(users, {
    fields: [supportTickets.closedByUserId],
    references: [users.id],
    relationName: "support_ticket_closer"
  }),
  messages: many(supportTicketMessages),
  attachments: many(supportTicketAttachments)
}));

export const supportTicketMessagesRelations = relations(supportTicketMessages, ({ one, many }) => ({
  ticket: one(supportTickets, {
    fields: [supportTicketMessages.ticketId],
    references: [supportTickets.id]
  }),
  author: one(users, {
    fields: [supportTicketMessages.authorUserId],
    references: [users.id]
  }),
  attachments: many(supportTicketAttachments)
}));

export const supportTicketAttachmentsRelations = relations(supportTicketAttachments, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [supportTicketAttachments.ticketId],
    references: [supportTickets.id]
  }),
  message: one(supportTicketMessages, {
    fields: [supportTicketAttachments.messageId],
    references: [supportTicketMessages.id]
  })
}));

export const appNotificationsRelations = relations(appNotifications, ({ one }) => ({
  user: one(users, {
    fields: [appNotifications.userId],
    references: [users.id]
  })
}));

export const adminMailingsRelations = relations(adminMailings, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [adminMailings.createdByUserId],
    references: [users.id]
  }),
  recipients: many(adminMailingRecipients),
  events: many(adminMailingEvents)
}));

export const adminMailingRecipientsRelations = relations(adminMailingRecipients, ({ one, many }) => ({
  mailing: one(adminMailings, {
    fields: [adminMailingRecipients.mailingId],
    references: [adminMailings.id]
  }),
  user: one(users, {
    fields: [adminMailingRecipients.userId],
    references: [users.id]
  }),
  events: many(adminMailingEvents)
}));

export const adminMailingEventsRelations = relations(adminMailingEvents, ({ one }) => ({
  mailing: one(adminMailings, {
    fields: [adminMailingEvents.mailingId],
    references: [adminMailings.id]
  }),
  recipient: one(adminMailingRecipients, {
    fields: [adminMailingEvents.recipientId],
    references: [adminMailingRecipients.id]
  })
}));

export type User = typeof users.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminActionLog = typeof adminActionLogs.$inferSelect;
export type ServerErrorLog = typeof serverErrorLogs.$inferSelect;
export type ErrorGroup = typeof errorGroups.$inferSelect;
export type ErrorOccurrence = typeof errorOccurrences.$inferSelect;
export type ErrorNotificationDelivery = typeof errorNotificationDeliveries.$inferSelect;
export type ClubSetting = typeof clubSettings.$inferSelect;
export type AuthEmailLoginCode = typeof authEmailLoginCodes.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type UserLoginIp = typeof userLoginIps.$inferSelect;
export type UserDevice = typeof userDevices.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type PaymentProvider = typeof paymentProviders.$inferSelect;
export type PaymentProduct = typeof paymentProducts.$inferSelect;
export type PaymentProductProviderPrice = typeof paymentProductProviderPrices.$inferSelect;
export type PaymentProviderCatalogItemPrice = typeof paymentProviderCatalogItemPrices.$inferSelect;
export type IndividualPaymentOffer = typeof individualPaymentOffers.$inferSelect;
export type PaymentOrder = typeof paymentOrders.$inferSelect;
export type UserRecurrentSubscription = typeof userRecurrentSubscriptions.$inferSelect;
export type ReferralCode = typeof referralCodes.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type ReferralReward = typeof referralRewards.$inferSelect;
export type PaymentWebhookEvent = typeof paymentWebhookEvents.$inferSelect;
export type ContentCategory = typeof contentCategories.$inferSelect;
export type ContentItem = typeof contentItems.$inferSelect;
export type UserContentProgress = typeof userContentProgress.$inferSelect;
export type LessonComment = typeof lessonComments.$inferSelect;
export type UserMute = typeof userMutes.$inferSelect;
export type ClubChat = typeof clubChats.$inferSelect;
export type ClubChatTopic = typeof clubChatTopics.$inferSelect;
export type ClubChatMessage = typeof clubChatMessages.$inferSelect;
export type ClubMessageAttachment = typeof clubMessageAttachments.$inferSelect;
export type ClubPoll = typeof clubPolls.$inferSelect;
export type ClubPollOption = typeof clubPollOptions.$inferSelect;
export type ClubPollVote = typeof clubPollVotes.$inferSelect;
export type ClubMessageReaction = typeof clubMessageReactions.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type SupportTicketMessage = typeof supportTicketMessages.$inferSelect;
export type SupportTicketAttachment = typeof supportTicketAttachments.$inferSelect;
export type AppNotification = typeof appNotifications.$inferSelect;
export type AdminMailing = typeof adminMailings.$inferSelect;
export type AdminMailingRecipient = typeof adminMailingRecipients.$inferSelect;
