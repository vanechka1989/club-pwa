import { relations } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const membershipStatus = pgEnum("membership_status", ["inactive", "active", "expired"]);
export const contentKind = pgEnum("content_kind", ["text", "photo", "video"]);
export const supportTicketStatus = pgEnum("support_ticket_status", ["open", "answered", "closed"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    telegramId: varchar("telegram_id", { length: 32 }).notNull(),
    firstName: varchar("first_name", { length: 128 }),
    username: varchar("username", { length: 64 }),
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
  contentProgress: many(userContentProgress)
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

export const contentItemsRelations = relations(contentItems, ({ one }) => ({
  category: one(contentCategories, {
    fields: [contentItems.categoryId],
    references: [contentCategories.id]
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
export type SupportTicket = typeof supportTickets.$inferSelect;
