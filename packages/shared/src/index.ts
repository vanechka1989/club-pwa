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
  photoUrl: z.string().url().nullable(),
  role: userRoleSchema,
  realRole: userRoleSchema,
  membershipStatus: membershipStatusSchema,
  membershipExpiresAt: z.string().datetime().nullable(),
  paymentType: z.enum(["none", "manual", "one_time", "recurrent"]),
  recurrentPaymentStatus: z.enum(["active", "cancelled"]).nullable(),
  nextPaymentAt: z.string().datetime().nullable(),
  avatarRefreshedAt: z.string().datetime().nullable()
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

export const contentKindSchema = z.enum(["text", "photo", "video", "audio"]);
export type ContentKind = z.infer<typeof contentKindSchema>;

export const contentCardLayoutSchema = z.enum(["vertical", "horizontal"]);
export type ContentCardLayout = z.infer<typeof contentCardLayoutSchema>;

export const learningCategorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  isPublished: z.boolean(),
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
  thumbnailUrl: z.string().url().nullable(),
  cardLayout: contentCardLayoutSchema,
  mediaContentType: z.string().nullable(),
  mediaSizeBytes: z.number().int().nonnegative().nullable(),
  publishedAt: z.string().datetime().nullable()
});
export type LearningContent = z.infer<typeof learningContentSchema>;

export const learningProgressSummarySchema = z.object({
  totalItems: z.number().int().nonnegative(),
  completedItems: z.number().int().nonnegative(),
  lastOpenedItem: learningContentSchema.nullable(),
  lastOpenedAt: z.string().datetime().nullable(),
  lastOpenedPlaybackPositionSeconds: z.number().int().nonnegative()
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
  completedAt: z.string().datetime().nullable(),
  playbackPositionSeconds: z.number().int().nonnegative()
});
export type LearningContentResponse = z.infer<typeof learningContentResponseSchema>;

export const learningProgressMutationResponseSchema = z.object({
  ok: z.boolean(),
  completedAt: z.string().datetime().nullable(),
  playbackPositionSeconds: z.number().int().nonnegative().optional()
});
export type LearningProgressMutationResponse = z.infer<typeof learningProgressMutationResponseSchema>;

export const learningPlaybackMutationResponseSchema = z.object({
  ok: z.boolean(),
  playbackPositionSeconds: z.number().int().nonnegative()
});
export type LearningPlaybackMutationResponse = z.infer<typeof learningPlaybackMutationResponseSchema>;

export const moderationStatusSchema = z.enum(["visible", "hidden", "deleted"]);
export type ModerationStatus = z.infer<typeof moderationStatusSchema>;

export const messageReactionSchema = z.enum(["thumbs_up", "fire", "heart", "laugh", "clap", "poop", "like", "dislike"]);
export type MessageReaction = z.infer<typeof messageReactionSchema>;

export const muteKindSchema = z.enum(["temporary", "permanent"]);
export type MuteKind = z.infer<typeof muteKindSchema>;

export const commentAuthorSchema = z.object({
  id: z.string(),
  telegramId: z.string(),
  firstName: z.string().nullable(),
  username: z.string().nullable(),
  photoUrl: z.string().url().nullable()
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

export const paymentProductKindSchema = z.enum(["one_time", "recurrent"]);
export type PaymentProductKind = z.infer<typeof paymentProductKindSchema>;

export const paymentProviderSchema = z.object({
  id: z.string(),
  provider: z.literal("prodamus"),
  title: z.string(),
  formUrl: z.string().url(),
  sys: z.string(),
  isEnabled: z.boolean(),
  secretConfigured: z.boolean(),
  webhookUrl: z.string().url()
});
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

export const paymentProductSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  kind: paymentProductKindSchema,
  title: z.string(),
  description: z.string().nullable(),
  amountRub: z.number().int().positive(),
  accessDays: z.number().int().positive(),
  prodamusSubscriptionId: z.string().nullable(),
  isPublished: z.boolean(),
  archivedUntil: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type PaymentProduct = z.infer<typeof paymentProductSchema>;

export const userRecurrentSubscriptionSchema = z.object({
  id: z.string(),
  productId: z.string(),
  title: z.string(),
  status: z.enum(["active", "cancelled"]),
  cancelledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type UserRecurrentSubscription = z.infer<typeof userRecurrentSubscriptionSchema>;

export const paymentOrderStatusSchema = z.enum(["pending", "paid", "failed", "cancelled"]);
export type PaymentOrderStatus = z.infer<typeof paymentOrderStatusSchema>;

export const paymentOrderLogSchema = z.object({
  id: z.string(),
  status: paymentOrderStatusSchema,
  amountRub: z.number().int().nonnegative(),
  providerOrderId: z.string(),
  providerPaymentId: z.string().nullable(),
  productTitle: z.string(),
  productKind: paymentProductKindSchema,
  customer: commentAuthorSchema,
  webhook: z
    .object({
      isValid: z.boolean(),
      createdAt: z.string().datetime()
    })
    .nullable(),
  paidAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type PaymentOrderLog = z.infer<typeof paymentOrderLogSchema>;

export const paymentOrderLogsResponseSchema = z.object({
  orders: z.array(paymentOrderLogSchema)
});
export type PaymentOrderLogsResponse = z.infer<typeof paymentOrderLogsResponseSchema>;

export const paymentsResponseSchema = z.object({
  plans: z.array(paymentPlanSchema),
  provider: paymentProviderSchema.nullable(),
  products: z.array(paymentProductSchema),
  recurrentSubscriptions: z.array(userRecurrentSubscriptionSchema)
});
export type PaymentsResponse = z.infer<typeof paymentsResponseSchema>;

export const adminPaymentProviderResponseSchema = z.object({
  provider: paymentProviderSchema.nullable(),
  webhookUrl: z.string().url()
});
export type AdminPaymentProviderResponse = z.infer<typeof adminPaymentProviderResponseSchema>;

export const paymentProviderMutationResponseSchema = z.object({
  ok: z.boolean(),
  provider: paymentProviderSchema
});
export type PaymentProviderMutationResponse = z.infer<typeof paymentProviderMutationResponseSchema>;

export const paymentProductMutationResponseSchema = z.object({
  ok: z.boolean(),
  product: paymentProductSchema
});
export type PaymentProductMutationResponse = z.infer<typeof paymentProductMutationResponseSchema>;

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
  latestReplyToMeAt: z.string().datetime().nullable(),
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
  reactionCounts: z.array(
    z.object({
      reaction: messageReactionSchema,
      count: z.number().int().nonnegative()
    })
  ),
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
  firstName: z.string().nullable(),
  username: z.string().nullable(),
  photoUrl: z.string().url().nullable(),
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
  photoUrl: z.string().url().nullable(),
  role: userRoleSchema,
  membershipStatus: membershipStatusSchema,
  membershipExpiresAt: z.string().datetime().nullable(),
  tariff: z.string().nullable(),
  hasRestrictions: z.boolean(),
  completedItems: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
  lastOpenedItemTitle: z.string().nullable(),
  lastOpenedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type AdminStatsUser = z.infer<typeof adminStatsUserSchema>;

export const adminUserSubscriptionSchema = z.object({
  id: z.string(),
  status: membershipStatusSchema,
  tariff: z.string().nullable(),
  provider: z.string(),
  providerPaymentId: z.string().nullable(),
  changedBy: z.string().nullable(),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type AdminUserSubscription = z.infer<typeof adminUserSubscriptionSchema>;

export const adminUserModerationEventSchema = z.object({
  id: z.string(),
  kind: z.enum(["mute", "lesson_comment", "chat_message"]),
  status: z.string(),
  body: z.string().nullable(),
  sourceTitle: z.string().nullable(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable()
});
export type AdminUserModerationEvent = z.infer<typeof adminUserModerationEventSchema>;

export const adminUserDetailResponseSchema = z.object({
  user: adminStatsUserSchema,
  subscriptions: z.array(adminUserSubscriptionSchema),
  moderationEvents: z.array(adminUserModerationEventSchema)
});
export type AdminUserDetailResponse = z.infer<typeof adminUserDetailResponseSchema>;

export const adminStatsResponseSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  activeUsers: z.number().int().nonnegative(),
  completedItems: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
  users: z.array(adminStatsUserSchema)
});
export type AdminStatsResponse = z.infer<typeof adminStatsResponseSchema>;

export const adminLearningMaterialSchema = learningContentSchema.extend({
  isPublished: z.boolean(),
  archivedUntil: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type AdminLearningMaterial = z.infer<typeof adminLearningMaterialSchema>;

export const adminLearningResponseSchema = z.object({
  categories: z.array(learningCategorySchema),
  materials: z.array(adminLearningMaterialSchema)
});
export type AdminLearningResponse = z.infer<typeof adminLearningResponseSchema>;

export const adminLearningMaterialMutationResponseSchema = z.object({
  ok: z.boolean(),
  material: adminLearningMaterialSchema
});
export type AdminLearningMaterialMutationResponse = z.infer<typeof adminLearningMaterialMutationResponseSchema>;

export const adminLearningCategoryMutationResponseSchema = z.object({
  ok: z.boolean(),
  category: learningCategorySchema
});
export type AdminLearningCategoryMutationResponse = z.infer<typeof adminLearningCategoryMutationResponseSchema>;

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
  firstName: z.string().nullable(),
  username: z.string().nullable(),
  photoUrl: z.string().url().nullable(),
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

export const s3StorageSourceSchema = z.enum(["database", "environment", "none"]);
export type S3StorageSource = z.infer<typeof s3StorageSourceSchema>;

export const s3StorageSettingsSchema = z.object({
  configured: z.boolean(),
  source: s3StorageSourceSchema,
  endpoint: z.string().url().nullable(),
  bucket: z.string().nullable(),
  region: z.string().nullable(),
  publicBaseUrl: z.string().url().nullable(),
  signedUrlTtlSeconds: z.number().int().positive(),
  accessKeyConfigured: z.boolean(),
  secretKeyConfigured: z.boolean(),
  updatedAt: z.string().datetime().nullable()
});
export type S3StorageSettings = z.infer<typeof s3StorageSettingsSchema>;

export const s3StorageSettingsResponseSchema = z.object({
  settings: s3StorageSettingsSchema
});
export type S3StorageSettingsResponse = z.infer<typeof s3StorageSettingsResponseSchema>;

export const s3StorageSettingsMutationResponseSchema = z.object({
  ok: z.boolean(),
  settings: s3StorageSettingsSchema
});
export type S3StorageSettingsMutationResponse = z.infer<typeof s3StorageSettingsMutationResponseSchema>;
