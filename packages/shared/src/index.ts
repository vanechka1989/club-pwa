import { z } from "zod";

export const membershipStatusSchema = z.enum(["inactive", "active", "expired"]);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const userRoleSchema = z.enum(["member", "admin", "owner"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const clubUserSchema = z.object({
  id: z.string(),
  telegramId: z.string(),
  firstName: z.string().nullable(),
  username: z.string().nullable(),
  role: userRoleSchema,
  membershipStatus: membershipStatusSchema,
  membershipExpiresAt: z.string().datetime().nullable()
});
export type ClubUser = z.infer<typeof clubUserSchema>;

export const meResponseSchema = z.object({
  user: clubUserSchema
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const subscribeResponseSchema = z.object({
  checkoutUrl: z.string().url().nullable(),
  message: z.string()
});
export type SubscribeResponse = z.infer<typeof subscribeResponseSchema>;

export const contentKindSchema = z.enum(["text", "photo", "video"]);
export type ContentKind = z.infer<typeof contentKindSchema>;

export const learningCategorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  itemsCount: z.number().int().nonnegative()
});
export type LearningCategory = z.infer<typeof learningCategorySchema>;

export const learningContentSchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  kind: contentKindSchema,
  title: z.string(),
  summary: z.string().nullable(),
  body: z.string().nullable(),
  mediaUrl: z.string().url().nullable(),
  publishedAt: z.string().datetime().nullable()
});
export type LearningContent = z.infer<typeof learningContentSchema>;

export const learningProgressSummarySchema = z.object({
  totalItems: z.number().int().nonnegative(),
  completedItems: z.number().int().nonnegative(),
  lastOpenedItem: learningContentSchema.nullable(),
  lastOpenedAt: z.string().datetime().nullable()
});
export type LearningProgressSummary = z.infer<typeof learningProgressSummarySchema>;

export const learningHomeResponseSchema = z.object({
  categories: z.array(learningCategorySchema),
  featured: z.array(learningContentSchema),
  progress: learningProgressSummarySchema
});
export type LearningHomeResponse = z.infer<typeof learningHomeResponseSchema>;

export const learningContentResponseSchema = z.object({
  item: learningContentSchema,
  completedAt: z.string().datetime().nullable()
});
export type LearningContentResponse = z.infer<typeof learningContentResponseSchema>;

export const learningProgressMutationResponseSchema = z.object({
  ok: z.boolean(),
  completedAt: z.string().datetime().nullable()
});
export type LearningProgressMutationResponse = z.infer<typeof learningProgressMutationResponseSchema>;

export const moderationStatusSchema = z.enum(["visible", "hidden", "deleted"]);
export type ModerationStatus = z.infer<typeof moderationStatusSchema>;

export const messageReactionSchema = z.enum(["like", "dislike"]);
export type MessageReaction = z.infer<typeof messageReactionSchema>;

export const muteKindSchema = z.enum(["temporary", "permanent"]);
export type MuteKind = z.infer<typeof muteKindSchema>;

export const commentAuthorSchema = z.object({
  id: z.string(),
  telegramId: z.string(),
  firstName: z.string().nullable(),
  username: z.string().nullable()
});
export type CommentAuthor = z.infer<typeof commentAuthorSchema>;

export const lessonCommentSchema = z.object({
  id: z.string(),
  contentItemId: z.string(),
  body: z.string(),
  status: moderationStatusSchema,
  author: commentAuthorSchema,
  createdAt: z.string().datetime()
});
export type LessonComment = z.infer<typeof lessonCommentSchema>;

export const lessonCommentsResponseSchema = z.object({
  comments: z.array(lessonCommentSchema),
  mutedUntil: z.string().datetime().nullable(),
  mutedPermanently: z.boolean()
});
export type LessonCommentsResponse = z.infer<typeof lessonCommentsResponseSchema>;

export const lessonCommentMutationResponseSchema = z.object({
  ok: z.boolean(),
  comment: lessonCommentSchema
});
export type LessonCommentMutationResponse = z.infer<typeof lessonCommentMutationResponseSchema>;

export const memberRequiredErrorSchema = z.object({
  error: z.string(),
  membershipStatus: membershipStatusSchema
});
export type MemberRequiredError = z.infer<typeof memberRequiredErrorSchema>;

export const paymentPlanSchema = z.object({
  id: z.string(),
  title: z.string(),
  priceLabel: z.string(),
  periodLabel: z.string(),
  description: z.string()
});
export type PaymentPlan = z.infer<typeof paymentPlanSchema>;

export const paymentsResponseSchema = z.object({
  plans: z.array(paymentPlanSchema)
});
export type PaymentsResponse = z.infer<typeof paymentsResponseSchema>;

export const supportTopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string()
});
export type SupportTopic = z.infer<typeof supportTopicSchema>;

export const supportHomeResponseSchema = z.object({
  topics: z.array(supportTopicSchema),
  managerContact: z.string().nullable()
});
export type SupportHomeResponse = z.infer<typeof supportHomeResponseSchema>;

export const clubChatSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  topicsCount: z.number().int().nonnegative()
});
export type ClubChat = z.infer<typeof clubChatSchema>;

export const clubTopicSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  isPinned: z.boolean(),
  isLocked: z.boolean(),
  isPublished: z.boolean(),
  archivedUntil: z.string().datetime().nullable(),
  messagesCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime()
});
export type ClubTopic = z.infer<typeof clubTopicSchema>;

export const clubMessageSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  body: z.string(),
  isSystem: z.boolean(),
  status: moderationStatusSchema,
  author: commentAuthorSchema,
  replyTo: z
    .object({
      id: z.string(),
      body: z.string(),
      author: commentAuthorSchema
    })
    .nullable(),
  likesCount: z.number().int().nonnegative(),
  dislikesCount: z.number().int().nonnegative(),
  myReaction: messageReactionSchema.nullable(),
  authorMute: z
    .object({
      id: z.string(),
      kind: muteKindSchema,
      expiresAt: z.string().datetime().nullable()
    })
    .nullable(),
  createdAt: z.string().datetime()
});
export type ClubMessage = z.infer<typeof clubMessageSchema>;

export const clubChatsResponseSchema = z.object({
  chats: z.array(clubChatSchema)
});
export type ClubChatsResponse = z.infer<typeof clubChatsResponseSchema>;

export const clubTopicsResponseSchema = z.object({
  topics: z.array(clubTopicSchema)
});
export type ClubTopicsResponse = z.infer<typeof clubTopicsResponseSchema>;

export const clubMessagesResponseSchema = z.object({
  messages: z.array(clubMessageSchema),
  mutedUntil: z.string().datetime().nullable(),
  mutedPermanently: z.boolean()
});
export type ClubMessagesResponse = z.infer<typeof clubMessagesResponseSchema>;

export const clubChatMutationResponseSchema = z.object({
  ok: z.boolean(),
  chat: clubChatSchema
});
export type ClubChatMutationResponse = z.infer<typeof clubChatMutationResponseSchema>;

export const clubTopicMutationResponseSchema = z.object({
  ok: z.boolean(),
  topic: clubTopicSchema
});
export type ClubTopicMutationResponse = z.infer<typeof clubTopicMutationResponseSchema>;

export const clubMessageMutationResponseSchema = z.object({
  ok: z.boolean(),
  message: clubMessageSchema
});
export type ClubMessageMutationResponse = z.infer<typeof clubMessageMutationResponseSchema>;

export const clubMessageReactionMutationResponseSchema = z.object({
  ok: z.boolean(),
  message: clubMessageSchema
});
export type ClubMessageReactionMutationResponse = z.infer<typeof clubMessageReactionMutationResponseSchema>;

export const adminUserSchema = z.object({
  id: z.string(),
  telegramId: z.string(),
  createdAt: z.string().datetime()
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminListResponseSchema = z.object({
  ownerTelegramId: z.string(),
  admins: z.array(adminUserSchema)
});
export type AdminListResponse = z.infer<typeof adminListResponseSchema>;

export const adminMutationResponseSchema = z.object({
  ok: z.boolean()
});
export type AdminMutationResponse = z.infer<typeof adminMutationResponseSchema>;

export const adminStatsUserSchema = z.object({
  id: z.string(),
  telegramId: z.string(),
  firstName: z.string().nullable(),
  username: z.string().nullable(),
  membershipStatus: membershipStatusSchema,
  membershipExpiresAt: z.string().datetime().nullable(),
  completedItems: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
  lastOpenedItemTitle: z.string().nullable(),
  lastOpenedAt: z.string().datetime().nullable()
});
export type AdminStatsUser = z.infer<typeof adminStatsUserSchema>;

export const adminStatsResponseSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  activeUsers: z.number().int().nonnegative(),
  completedItems: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
  users: z.array(adminStatsUserSchema)
});
export type AdminStatsResponse = z.infer<typeof adminStatsResponseSchema>;

export const adminAccessMutationResponseSchema = z.object({
  ok: z.boolean(),
  user: adminStatsUserSchema
});
export type AdminAccessMutationResponse = z.infer<typeof adminAccessMutationResponseSchema>;

export const adminModerationItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["lesson_comment", "chat_message"]),
  body: z.string(),
  status: moderationStatusSchema,
  author: commentAuthorSchema,
  sourceTitle: z.string(),
  createdAt: z.string().datetime()
});
export type AdminModerationItem = z.infer<typeof adminModerationItemSchema>;

export const adminModerationResponseSchema = z.object({
  items: z.array(adminModerationItemSchema)
});
export type AdminModerationResponse = z.infer<typeof adminModerationResponseSchema>;

export const adminMuteSchema = z.object({
  id: z.string(),
  userId: z.string(),
  telegramId: z.string(),
  kind: muteKindSchema,
  reason: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type AdminMute = z.infer<typeof adminMuteSchema>;

export const adminMutesResponseSchema = z.object({
  mutes: z.array(adminMuteSchema)
});
export type AdminMutesResponse = z.infer<typeof adminMutesResponseSchema>;
