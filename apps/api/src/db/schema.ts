import { relations } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";

export const membershipStatus = pgEnum("membership_status", ["inactive", "active", "expired"]);
export const contentKind = pgEnum("content_kind", ["text", "photo", "video", "audio"]);
export const supportTicketStatus = pgEnum("support_ticket_status", ["open", "answered", "closed"]);
export const moderationStatus = pgEnum("moderation_status", ["visible", "hidden", "deleted"]);
export const muteKind = pgEnum("mute_kind", ["temporary", "permanent"]);
export const messageReaction = pgEnum("message_reaction", ["like", "dislike", "thumbs_up", "fire", "heart", "laugh", "clap", "poop"]);
export const paymentProductKind = pgEnum("payment_product_kind", ["one_time", "recurrent"]);
export const paymentOrderStatus = pgEnum("payment_order_status", ["pending", "paid", "failed", "cancelled"]);
export const recurrentSubscriptionStatus = pgEnum("recurrent_subscription_status", ["active", "cancelled"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramId: varchar("telegram_id", { length: 32 }).notNull(),
    firstName: varchar("first_name", { length: 128 }),
    username: varchar("username", { length: 64 }),
    photoUrl: text("photo_url"),
    avatarRefreshedAt: timestamp("avatar_refreshed_at", { withTimezone: true }),
    telegramBotStatus: varchar("telegram_bot_status", { length: 16 }).notNull().default("unknown"),
    telegramBotBlockedAt: timestamp("telegram_bot_blocked_at", { withTimezone: true }),
    telegramBotUnblockedAt: timestamp("telegram_bot_unblocked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    telegramIdIdx: uniqueIndex("users_telegram_id_idx").on(table.telegramId)
  })
);

export const adminUsers = pgTable(
  "admin_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramId: varchar("telegram_id", { length: 32 }).notNull(),
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
    actorTelegramId: varchar("actor_telegram_id", { length: 32 }).notNull(),
    action: varchar("action", { length: 96 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(),
    entityId: varchar("entity_id", { length: 128 }),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
    targetTelegramId: varchar("target_telegram_id", { length: 32 }),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    actorCreatedIdx: index("admin_action_logs_actor_created_idx").on(table.actorTelegramId, table.createdAt),
    actionCreatedIdx: index("admin_action_logs_action_created_idx").on(table.action, table.createdAt),
    entityIdx: index("admin_action_logs_entity_idx").on(table.entityType, table.entityId),
    targetCreatedIdx: index("admin_action_logs_target_created_idx").on(table.targetTelegramId, table.createdAt),
    createdIdx: index("admin_action_logs_created_idx").on(table.createdAt)
  })
);

export const clubSettings = pgTable("club_settings", {
  key: varchar("key", { length: 96 }).primaryKey(),
  value: text("value").notNull(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

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
    userStatusIdx: index("subscriptions_user_status_idx").on(table.userId, table.status)
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
    amountRub: integer("amount_rub").notNull(),
    accessDays: integer("access_days").notNull(),
    prodamusSubscriptionId: varchar("prodamus_subscription_id", { length: 64 }),
    isPublished: boolean("is_published").notNull().default(false),
    archivedUntil: timestamp("archived_until", { withTimezone: true }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    providerKindIdx: index("payment_products_provider_kind_idx").on(table.providerId, table.kind, table.isPublished),
    archivedIdx: index("payment_products_archived_idx").on(table.archivedUntil)
  })
);

export const paymentOrders = pgTable(
  "payment_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => paymentProducts.id, { onDelete: "restrict" }),
    providerId: uuid("provider_id").notNull().references(() => paymentProviders.id, { onDelete: "restrict" }),
    status: paymentOrderStatus("status").notNull().default("pending"),
    amountRub: integer("amount_rub").notNull(),
    providerOrderId: varchar("provider_order_id", { length: 128 }).notNull(),
    providerPaymentId: varchar("provider_payment_id", { length: 128 }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    providerOrderIdx: uniqueIndex("payment_orders_provider_order_idx").on(table.providerOrderId),
    userStatusIdx: index("payment_orders_user_status_idx").on(table.userId, table.status)
  })
);

export const userRecurrentSubscriptions = pgTable(
  "user_recurrent_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => paymentProducts.id, { onDelete: "restrict" }),
    providerId: uuid("provider_id").notNull().references(() => paymentProviders.id, { onDelete: "restrict" }),
    status: recurrentSubscriptionStatus("status").notNull().default("active"),
    prodamusSubscriptionId: varchar("prodamus_subscription_id", { length: 64 }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userProductIdx: uniqueIndex("user_recurrent_subscriptions_user_product_idx").on(table.userId, table.productId),
    userStatusIdx: index("user_recurrent_subscriptions_user_status_idx").on(table.userId, table.status)
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    slugIdx: uniqueIndex("content_categories_slug_idx").on(table.slug),
    publishedSortIdx: index("content_categories_published_sort_idx").on(table.isPublished, table.sortOrder)
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
    cardLayout: varchar("card_layout", { length: 24 }).notNull().default("vertical"),
    thumbnailObjectKey: text("thumbnail_object_key"),
    thumbnailContentType: varchar("thumbnail_content_type", { length: 160 }),
    thumbnailSizeBytes: integer("thumbnail_size_bytes"),
    mediaContentType: varchar("media_content_type", { length: 160 }),
    mediaSizeBytes: integer("media_size_bytes"),
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
    isSystem: boolean("is_system").notNull().default(false),
    status: moderationStatus("status").notNull().default("visible"),
    moderatedByUserId: uuid("moderated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    moderationReason: text("moderation_reason"),
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
    userCreatedIdx: index("club_chat_messages_user_created_idx").on(table.userId, table.createdAt)
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
    sourceIdx: index("app_notifications_source_idx").on(table.source, table.sourceId)
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
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
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
    telegramId: varchar("telegram_id", { length: 32 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    mailingStatusIdx: index("admin_mailing_recipients_mailing_status_idx").on(table.mailingId, table.status, table.createdAt),
    userIdx: index("admin_mailing_recipients_user_idx").on(table.userId)
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  subscriptions: many(subscriptions),
  paymentOrders: many(paymentOrders),
  recurrentSubscriptions: many(userRecurrentSubscriptions),
  supportTickets: many(supportTickets),
  supportMessages: many(supportTicketMessages),
  createdAdminUsers: many(adminUsers),
  adminActionLogs: many(adminActionLogs, { relationName: "admin_action_actor" }),
  targetedAdminActionLogs: many(adminActionLogs, { relationName: "admin_action_target" }),
  contentProgress: many(userContentProgress),
  lessonComments: many(lessonComments),
  mutes: many(userMutes),
  chatMessages: many(clubChatMessages),
  notifications: many(appNotifications),
  createdMailings: many(adminMailings),
  mailingRecipients: many(adminMailingRecipients)
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
  orders: many(paymentOrders)
}));

export const paymentProductsRelations = relations(paymentProducts, ({ one, many }) => ({
  provider: one(paymentProviders, {
    fields: [paymentProducts.providerId],
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
  provider: one(paymentProviders, {
    fields: [userRecurrentSubscriptions.providerId],
    references: [paymentProviders.id]
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

export const clubChatMessagesRelations = relations(clubChatMessages, ({ one }) => ({
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
  })
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
    references: [users.id]
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
  recipients: many(adminMailingRecipients)
}));

export const adminMailingRecipientsRelations = relations(adminMailingRecipients, ({ one }) => ({
  mailing: one(adminMailings, {
    fields: [adminMailingRecipients.mailingId],
    references: [adminMailings.id]
  }),
  user: one(users, {
    fields: [adminMailingRecipients.userId],
    references: [users.id]
  })
}));

export type User = typeof users.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type AdminActionLog = typeof adminActionLogs.$inferSelect;
export type ClubSetting = typeof clubSettings.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type PaymentProvider = typeof paymentProviders.$inferSelect;
export type PaymentProduct = typeof paymentProducts.$inferSelect;
export type PaymentOrder = typeof paymentOrders.$inferSelect;
export type UserRecurrentSubscription = typeof userRecurrentSubscriptions.$inferSelect;
export type PaymentWebhookEvent = typeof paymentWebhookEvents.$inferSelect;
export type ContentCategory = typeof contentCategories.$inferSelect;
export type ContentItem = typeof contentItems.$inferSelect;
export type UserContentProgress = typeof userContentProgress.$inferSelect;
export type LessonComment = typeof lessonComments.$inferSelect;
export type UserMute = typeof userMutes.$inferSelect;
export type ClubChat = typeof clubChats.$inferSelect;
export type ClubChatTopic = typeof clubChatTopics.$inferSelect;
export type ClubChatMessage = typeof clubChatMessages.$inferSelect;
export type ClubMessageReaction = typeof clubMessageReactions.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type SupportTicketMessage = typeof supportTicketMessages.$inferSelect;
export type SupportTicketAttachment = typeof supportTicketAttachments.$inferSelect;
export type AppNotification = typeof appNotifications.$inferSelect;
export type AdminMailing = typeof adminMailings.$inferSelect;
export type AdminMailingRecipient = typeof adminMailingRecipients.$inferSelect;
