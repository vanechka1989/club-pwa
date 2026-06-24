import { relations } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar, type AnyPgColumn } from "drizzle-orm/pg-core";

export const membershipStatus = pgEnum("membership_status", ["inactive", "active", "expired"]);
export const contentKind = pgEnum("content_kind", ["text", "photo", "video"]);
export const supportTicketStatus = pgEnum("support_ticket_status", ["open", "answered", "closed"]);
export const moderationStatus = pgEnum("moderation_status", ["visible", "hidden", "deleted"]);
export const muteKind = pgEnum("mute_kind", ["temporary", "permanent"]);
export const messageReaction = pgEnum("message_reaction", ["like", "dislike", "thumbs_up", "fire", "heart", "laugh", "clap"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramId: varchar("telegram_id", { length: 32 }).notNull(),
    firstName: varchar("first_name", { length: 128 }),
    username: varchar("username", { length: 64 }),
    photoUrl: text("photo_url"),
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
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    telegramIdIdx: uniqueIndex("admin_users_telegram_id_idx").on(table.telegramId)
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
    userStatusIdx: index("subscriptions_user_status_idx").on(table.userId, table.status)
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
    sortOrder: integer("sort_order").notNull().default(0),
    isPublished: boolean("is_published").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
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

export const userContentProgress = pgTable(
  "user_content_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    contentItemId: uuid("content_item_id").notNull().references(() => contentItems.id, { onDelete: "cascade" }),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userItemIdx: uniqueIndex("user_content_progress_user_item_idx").on(table.userId, table.contentItemId),
    userLastOpenedIdx: index("user_content_progress_user_last_opened_idx").on(table.userId, table.lastOpenedAt),
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
    message: text("message").notNull(),
    status: supportTicketStatus("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userStatusIdx: index("support_tickets_user_status_idx").on(table.userId, table.status)
  })
);

export const usersRelations = relations(users, ({ many }) => ({
  subscriptions: many(subscriptions),
  supportTickets: many(supportTickets),
  createdAdminUsers: many(adminUsers),
  contentProgress: many(userContentProgress),
  lessonComments: many(lessonComments),
  mutes: many(userMutes),
  chatMessages: many(clubChatMessages)
}));

export const adminUsersRelations = relations(adminUsers, ({ one }) => ({
  createdBy: one(users, {
    fields: [adminUsers.createdByUserId],
    references: [users.id]
  })
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id]
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
  comments: many(lessonComments)
}));

export const userContentProgressRelations = relations(userContentProgress, ({ one }) => ({
  user: one(users, {
    fields: [userContentProgress.userId],
    references: [users.id]
  }),
  item: one(contentItems, {
    fields: [userContentProgress.contentItemId],
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

export const supportTicketsRelations = relations(supportTickets, ({ one }) => ({
  user: one(users, {
    fields: [supportTickets.userId],
    references: [users.id]
  })
}));

export type User = typeof users.$inferSelect;
export type AdminUser = typeof adminUsers.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
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
