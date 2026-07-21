import { z } from "zod";

export const displayNamePattern = /^[\p{L}\p{N}_-]{3,20}$/u;
export function normalizeDisplayName(value: string) {
  return value.trim();
}
export function isValidDisplayName(value: string) {
  return displayNamePattern.test(normalizeDisplayName(value));
}
export function resolveDisplayName(user: {
  displayName?: string | null | undefined;
  firstName?: string | null | undefined;
  username?: string | null | undefined;
  telegramId?: string | null | undefined;
}) {
  return user.displayName || user.firstName || user.username || (user.telegramId ? `ID ${user.telegramId}` : "Пользователь");
}

export const membershipStatusSchema = z.enum(["inactive", "active", "expired"]);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const userRoleSchema = z.enum(["member", "admin", "owner"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const adminPermissionValues = [
  "statistics",
  "users",
  "accesses",
  "mailings",
  "payments",
  "materials",
  "support",
  "community",
  "storage",
  "admins",
  "login_ips",
  "project_settings"
] as const;
export const adminPermissionSchema = z.enum(adminPermissionValues);
export type AdminPermission = z.infer<typeof adminPermissionSchema>;
export const allAdminPermissions: AdminPermission[] = [...adminPermissionValues];
export const newAdminDefaultPermissions: AdminPermission[] = [];
export const adminPermissionLabels: Record<AdminPermission, string> = {
  statistics: "Статистика",
  users: "Клиенты",
  accesses: "Доступы",
  mailings: "Рассылки",
  payments: "Оплаты",
  materials: "Контент обучения",
  support: "Поддержка",
  community: "Общение",
  storage: "Хранилище",
  admins: "Админы",
  login_ips: "IP входов",
  project_settings: "Настройки проекта"
};

export const acquisitionAttributionSchema = z.enum(["first", "last"]);
export type AcquisitionAttribution = z.infer<typeof acquisitionAttributionSchema>;

export const acquisitionDestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("home") }),
  z.object({ kind: z.literal("billing") }),
  z.object({ kind: z.literal("module"), moduleId: z.string().uuid() })
]);
export type AcquisitionDestination = z.infer<typeof acquisitionDestinationSchema>;

export const acquisitionAidSchema = z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const acquisitionLinkInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: acquisitionAidSchema.optional(),
  source: z.string().trim().max(80),
  medium: z.string().trim().max(80),
  campaign: z.string().trim().max(120),
  content: z.string().trim().max(120).nullable().optional(),
  destination: acquisitionDestinationSchema.default({ kind: "home" })
}).superRefine((value, context) => {
  if (![value.source, value.medium, value.campaign, value.content].some((item) => item?.trim())) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Заполните хотя бы одну UTM-метку", path: ["source"] });
  }
});
export type AcquisitionLinkInput = z.infer<typeof acquisitionLinkInputSchema>;

export const acquisitionTouchSchema = z.object({
  linkId: z.string().uuid(),
  aid: acquisitionAidSchema,
  linkName: z.string(),
  source: z.string(),
  medium: z.string(),
  campaign: z.string(),
  content: z.string().nullable(),
  visitedAt: z.string().datetime()
});
export type AcquisitionTouch = z.infer<typeof acquisitionTouchSchema>;

export const acquisitionMetricRowSchema = z.object({
  key: z.string(),
  label: z.string(),
  visits: z.number().int().nonnegative(),
  registrations: z.number().int().nonnegative(),
  overlapRegistrations: z.number().int().nonnegative().default(0),
  paidUsers: z.number().int().nonnegative(),
  revenueRub: z.number().int().nonnegative()
});

export const acquisitionTimelinePointSchema = z.object({
  date: z.string(),
  visits: z.number().int().nonnegative(),
  registrations: z.number().int().nonnegative(),
  paidUsers: z.number().int().nonnegative(),
  revenueRub: z.number().int().nonnegative()
});

export const adminAcquisitionLinkSchema = z.object({
  id: z.string().uuid(),
  aid: acquisitionAidSchema,
  name: z.string(),
  source: z.string(),
  medium: z.string(),
  campaign: z.string(),
  content: z.string().nullable(),
  destination: acquisitionDestinationSchema,
  url: z.string().url(),
  shortUrl: z.string().url(),
  isActive: z.boolean(),
  visits: z.number().int().nonnegative().default(0),
  uniqueVisitors: z.number().int().nonnegative().default(0),
  registrations: z.number().int().nonnegative().default(0),
  paidUsers: z.number().int().nonnegative().default(0),
  revenueRub: z.number().int().nonnegative().default(0),
  createdBy: z.object({ id: z.string().uuid(), label: z.string() }).nullable().default(null),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type AdminAcquisitionLink = z.infer<typeof adminAcquisitionLinkSchema>;

export const adminAcquisitionDashboardSchema = z.object({
  attribution: acquisitionAttributionSchema,
  period: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
  summary: z.object({
    visits: z.number().int().nonnegative(),
    uniqueVisitors: z.number().int().nonnegative(),
    registrations: z.number().int().nonnegative(),
    paidUsers: z.number().int().nonnegative(),
    revenueRub: z.number().int().nonnegative(),
    visitToRegistrationRate: z.number().nonnegative(),
    registrationToPaidRate: z.number().nonnegative(),
    visitToPaidRate: z.number().nonnegative()
  }),
  timeline: z.array(acquisitionTimelinePointSchema),
  sources: z.array(acquisitionMetricRowSchema),
  campaigns: z.array(acquisitionMetricRowSchema),
  topLinks: z.array(adminAcquisitionLinkSchema)
});
export type AdminAcquisitionDashboard = z.infer<typeof adminAcquisitionDashboardSchema>;

export const adminAcquisitionPersonSchema = z.object({
  userId: z.string(),
  telegramId: z.string(),
  label: z.string(),
  username: z.string().nullable()
});
export type AdminAcquisitionPerson = z.infer<typeof adminAcquisitionPersonSchema>;

const adminAcquisitionDayBaseEventSchema = z.object({
  occurredAt: z.string().datetime(),
  source: z.string(),
  campaign: z.string(),
  linkName: z.string()
});

export const adminAcquisitionDayDetailSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  visits: z.array(adminAcquisitionDayBaseEventSchema.extend({
    id: z.string(),
    visitorLabel: z.string(),
    user: adminAcquisitionPersonSchema.nullable()
  })),
  registrations: z.array(adminAcquisitionDayBaseEventSchema.extend({
    user: adminAcquisitionPersonSchema
  })),
  payments: z.array(adminAcquisitionDayBaseEventSchema.extend({
    amountRub: z.number().int().nonnegative(),
    user: adminAcquisitionPersonSchema
  }))
});
export type AdminAcquisitionDayDetail = z.infer<typeof adminAcquisitionDayDetailSchema>;

export const adminUserAcquisitionSchema = z.object({
  firstTouch: acquisitionTouchSchema.nullable(),
  lastTouch: acquisitionTouchSchema.nullable(),
  registeredAt: z.string().datetime(),
  firstPaidAt: z.string().datetime().nullable(),
  registrationDelaySeconds: z.number().int().nonnegative().nullable(),
  firstPaymentDelaySeconds: z.number().int().nonnegative().nullable(),
  paidOrders: z.number().int().nonnegative(),
  revenueRub: z.number().int().nonnegative(),
  visits: z.array(acquisitionTouchSchema)
});
export type AdminUserAcquisition = z.infer<typeof adminUserAcquisitionSchema>;

export const clubUserSchema = z.object({
  id: z.string(),
  telegramId: z.string(),
  email: z.string().email().nullable().optional(),
  firstName: z.string().nullable(),
  username: z.string().nullable(),
  displayName: z.string().nullable().optional(),
  displayNameChangedByUserAt: z.string().datetime().nullable().optional(),
  photoUrl: z.string().url().nullable(),
  role: userRoleSchema,
  realRole: userRoleSchema,
  adminRoleLabel: z.string().nullable().default(null),
  adminPermissions: z.array(adminPermissionSchema).default([]),
  membershipStatus: membershipStatusSchema,
  membershipExpiresAt: z.string().datetime().nullable(),
  paymentType: z.enum(["none", "manual", "one_time", "recurrent"]),
  recurrentPaymentStatus: z.enum(["active", "cancelled"]).nullable(),
  nextPaymentAt: z.string().datetime().nullable(),
  avatarPositionX: z.number().min(0).max(100).default(50),
  avatarPositionY: z.number().min(0).max(100).default(50),
  avatarScale: z.number().min(1).max(2.5).default(1),
  avatarRefreshedAt: z.string().datetime().nullable()
});
export type ClubUser = z.infer<typeof clubUserSchema>;

export const meResponseSchema = z.object({
  user: clubUserSchema
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const appAccessStateSchema = clubUserSchema.pick({
  role: true,
  realRole: true,
  adminRoleLabel: true,
  adminPermissions: true,
  membershipStatus: true,
  membershipExpiresAt: true,
  paymentType: true,
  recurrentPaymentStatus: true,
  nextPaymentAt: true
});
export type AppAccessState = z.infer<typeof appAccessStateSchema>;

export const appStateResponseSchema = z.object({
  access: appAccessStateSchema,
  notificationUnreadCount: z.number().int().nonnegative(),
  supportUnreadCount: z.number().int().nonnegative()
});
export type AppStateResponse = z.infer<typeof appStateResponseSchema>;

export const subscribeResponseSchema = z.object({
  checkoutUrl: z.string().url().nullable(),
  message: z.string()
});
export type SubscribeResponse = z.infer<typeof subscribeResponseSchema>;

export const contentKindSchema = z.enum(["text", "photo", "video", "audio"]);
export type ContentKind = z.infer<typeof contentKindSchema>;

export const contentCardLayoutSchema = z.enum(["vertical", "horizontal"]);
export type ContentCardLayout = z.infer<typeof contentCardLayoutSchema>;
export const lessonCoverModeSchema = z.enum(["default", "custom", "first_material"]);
export type LessonCoverMode = z.infer<typeof lessonCoverModeSchema>;

export const mediaSourceSchema = z.enum(["s3", "external"]);
export type MediaSource = z.infer<typeof mediaSourceSchema>;

export function normalizeExternalMediaUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function normalizeYouTubeHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
}

export function getYouTubeVideoId(value: string | null | undefined) {
  const normalizedUrl = normalizeExternalMediaUrl(value);
  if (!normalizedUrl) {
    return null;
  }

  const url = new URL(normalizedUrl);
  const host = normalizeYouTubeHost(url.hostname);
  let videoId: string | null = null;

  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
      videoId = parts[1] ?? null;
    }
  }

  return videoId && /^[\w-]{6,32}$/.test(videoId) ? videoId : null;
}

export function isYouTubeMediaUrl(value: string | null | undefined) {
  return Boolean(getYouTubeVideoId(value));
}

export function getYouTubeEmbedUrl(value: string | null | undefined) {
  const videoId = getYouTubeVideoId(value);
  return videoId ? `https://www.youtube.com/embed/${videoId}?rel=0&playsinline=1` : null;
}

export function getYouTubeThumbnailUrl(value: string | null | undefined) {
  const videoId = getYouTubeVideoId(value);
  return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
}

export const lessonMaterialSchema = z.object({
  id: z.string(),
  kind: contentKindSchema,
  title: z.string(),
  description: z.string().nullable(),
  body: z.string().nullable(),
  mediaUrl: z.string().url().nullable(),
  mediaSource: mediaSourceSchema.nullable().optional(),
  mediaContentType: z.string().nullable(),
  mediaSizeBytes: z.number().int().nonnegative().nullable()
});
export type LessonMaterial = z.infer<typeof lessonMaterialSchema>;

export const learningCategorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  defaultCardLayout: contentCardLayoutSchema.default("vertical"),
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
  mediaSource: mediaSourceSchema.nullable().optional(),
  thumbnailUrl: z.string().url().nullable(),
  coverMode: lessonCoverModeSchema.optional(),
  coverSourceUrl: z.string().url().nullable().optional(),
  cardLayout: contentCardLayoutSchema,
  mediaContentType: z.string().nullable(),
  mediaSizeBytes: z.number().int().nonnegative().nullable(),
  materials: z.array(lessonMaterialSchema).optional(),
  publishedAt: z.string().datetime().nullable()
});
export type LearningContent = z.infer<typeof learningContentSchema>;

export const learningProgressSummarySchema = z.object({
  totalItems: z.number().int().nonnegative(),
  completedItems: z.number().int().nonnegative(),
  lastOpenedItem: learningContentSchema.nullable(),
  lastOpenedMaterialId: z.string().nullable().optional(),
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
  lastOpenedMaterialId: z.string().nullable().optional(),
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
  lastOpenedMaterialId: z.string().nullable().optional(),
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
  displayName: z.string().nullable().optional(),
  photoUrl: z.string().url().nullable(),
  avatarPositionX: z.number().min(0).max(100).default(50),
  avatarPositionY: z.number().min(0).max(100).default(50),
  avatarScale: z.number().min(1).max(2.5).default(1)
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
  badgeLabel: z.string().nullable(),
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

export const paymentDiagnosticStateSchema = z.enum([
  "paid",
  "awaiting_payment",
  "expired",
  "failed",
  "cancelled",
  "webhook_error"
]);
export type PaymentDiagnosticState = z.infer<typeof paymentDiagnosticStateSchema>;

export const paymentDiagnosticSchema = z.object({
  state: paymentDiagnosticStateSchema,
  reason: z.string(),
  severity: z.enum(["success", "info", "warning", "danger"])
});
export type PaymentDiagnostic = z.infer<typeof paymentDiagnosticSchema>;

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
  updatedAt: z.string().datetime(),
  diagnostic: paymentDiagnosticSchema.optional()
});
export type PaymentOrderLog = z.infer<typeof paymentOrderLogSchema>;

export const paymentOrderLogsResponseSchema = z.object({
  orders: z.array(paymentOrderLogSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    paid: z.number().int().nonnegative(),
    awaitingPayment: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    webhookErrors: z.number().int().nonnegative()
  }).optional()
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

export const supportAttachmentSchema = z.object({
  id: z.string(),
  kind: z.enum(["photo", "video"]),
  fileName: z.string(),
  url: z.string().url(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string().datetime()
});
export type SupportAttachment = z.infer<typeof supportAttachmentSchema>;

export const supportMessageSchema = z.object({
  id: z.string(),
  authorRole: z.enum(["customer", "admin"]),
  body: z.string(),
  author: z.object({
    telegramId: z.string(),
    firstName: z.string().nullable(),
    username: z.string().nullable(),
    photoUrl: z.string().url().nullable()
  }),
  attachments: z.array(supportAttachmentSchema),
  createdAt: z.string().datetime()
});
export type SupportMessage = z.infer<typeof supportMessageSchema>;

export const supportTicketSchema = z.object({
  id: z.string(),
  topic: z.string(),
  topicTitle: z.string(),
  customTopic: z.string().nullable(),
  message: z.string(),
  status: z.enum(["open", "answered", "closed"]),
  statusLabel: z.string(),
  waitingSince: z.string().datetime().nullable(),
  customer: z.object({
    telegramId: z.string(),
    firstName: z.string().nullable(),
    username: z.string().nullable(),
    photoUrl: z.string().url().nullable()
  }),
  closedAt: z.string().datetime().nullable(),
  closedBy: z.object({
    telegramId: z.string(),
    firstName: z.string().nullable(),
    username: z.string().nullable(),
    photoUrl: z.string().url().nullable()
  }).nullable(),
  messages: z.array(supportMessageSchema),
  unread: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type SupportTicket = z.infer<typeof supportTicketSchema>;

export const supportHomeResponseSchema = z.object({
  topics: z.array(supportTopicSchema),
  managerContact: z.string().nullable(),
  tickets: z.array(supportTicketSchema).default([]),
  unreadCount: z.number().int().nonnegative().default(0)
});
export type SupportHomeResponse = z.infer<typeof supportHomeResponseSchema>;

export const supportTicketMutationResponseSchema = z.object({
  ok: z.boolean(),
  ticket: supportTicketSchema,
  unreadCount: z.number().int().nonnegative()
});
export type SupportTicketMutationResponse = z.infer<typeof supportTicketMutationResponseSchema>;

export const supportUnreadResponseSchema = z.object({
  unreadCount: z.number().int().nonnegative()
});
export type SupportUnreadResponse = z.infer<typeof supportUnreadResponseSchema>;

export const adminSupportResponseSchema = z.object({
  tickets: z.array(supportTicketSchema),
  unreadCount: z.number().int().nonnegative()
});
export type AdminSupportResponse = z.infer<typeof adminSupportResponseSchema>;

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
  isAdminOnly: z.boolean().default(false),
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
  kind: z.enum(["text", "voice", "images", "poll"]).default("text"),
  voice: z
    .object({
      id: z.string(),
      url: z.string().url().nullable(),
      contentType: z.string(),
      sizeBytes: z.number().int().nonnegative(),
      durationSeconds: z.number().int().nonnegative(),
      expiresAt: z.string().datetime().nullable(),
      deletedAt: z.string().datetime().nullable()
    })
    .nullable()
    .default(null),
  images: z
    .array(
      z.object({
        id: z.string(),
        url: z.string().url().nullable(),
        contentType: z.string(),
        sizeBytes: z.number().int().nonnegative(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        expiresAt: z.string().datetime().nullable(),
        deletedAt: z.string().datetime().nullable()
      })
    )
    .default([]),
  poll: z
    .object({
      id: z.string(),
      question: z.string(),
      allowsMultiple: z.boolean(),
      isAnonymous: z.boolean(),
      closesAt: z.string().datetime().nullable(),
      closedAt: z.string().datetime().nullable(),
      totalVoters: z.number().int().nonnegative(),
      options: z.array(
        z.object({
          id: z.string(),
          text: z.string(),
          votesCount: z.number().int().nonnegative(),
          percent: z.number().min(0).max(100),
          selected: z.boolean()
        })
      ),
      voterDetails: z
        .array(z.object({ optionId: z.string(), users: z.array(commentAuthorSchema) }))
        .nullable()
    })
    .nullable()
    .default(null),
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
  pinnedAt: z.string().datetime().nullable().optional(),
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
  roleLabel: z.string().nullable(),
  isActive: z.boolean(),
  permissions: z.array(adminPermissionSchema),
  createdAt: z.string().datetime()
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminListResponseSchema = z.object({
  ownerTelegramId: z.string(),
  admins: z.array(adminUserSchema)
});
export type AdminListResponse = z.infer<typeof adminListResponseSchema>;

export const adminActionActorSchema = z.object({
  telegramId: z.string(),
  firstName: z.string().nullable(),
  username: z.string().nullable(),
  photoUrl: z.string().url().nullable()
});
export type AdminActionActor = z.infer<typeof adminActionActorSchema>;

export const adminActionLogSchema = z.object({
  id: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  targetTelegramId: z.string().nullable(),
  summary: z.string(),
  metadata: z.record(z.unknown()),
  actor: adminActionActorSchema.nullable(),
  target: adminActionActorSchema.nullable(),
  createdAt: z.string().datetime()
});
export type AdminActionLog = z.infer<typeof adminActionLogSchema>;

export const adminActionLogsResponseSchema = z.object({
  admins: z.array(adminActionActorSchema),
  logs: z.array(adminActionLogSchema)
});
export type AdminActionLogsResponse = z.infer<typeof adminActionLogsResponseSchema>;

export const adminMutationResponseSchema = z.object({
  ok: z.boolean()
});
export type AdminMutationResponse = z.infer<typeof adminMutationResponseSchema>;

export const ownerEmailLoginCodeResponseSchema = z.object({
  ok: z.literal(true),
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  expiresAt: z.string().datetime()
});
export type OwnerEmailLoginCodeResponse = z.infer<typeof ownerEmailLoginCodeResponseSchema>;

export const telegramBotStatusSchema = z.enum(["unknown", "active", "blocked"]);
export type TelegramBotStatus = z.infer<typeof telegramBotStatusSchema>;

export const adminStatsUserSchema = z.object({
  id: z.string(),
  telegramId: z.string(),
  email: z.string().email().nullable().optional(),
  marketingEmailOptOutAt: z.string().datetime().nullable().optional(),
  firstName: z.string().nullable(),
  username: z.string().nullable(),
  displayName: z.string().nullable().optional(),
  displayNameChangedByUserAt: z.string().datetime().nullable().optional(),
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
  lastLoginAt: z.string().datetime(),
  telegramBotStatus: telegramBotStatusSchema,
  telegramBotBlockedAt: z.string().datetime().nullable(),
  telegramBotUnblockedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type AdminStatsUser = z.infer<typeof adminStatsUserSchema>;

export const adminCommunityMessageSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  topicTitle: z.string(),
  isSystem: z.boolean(),
  status: moderationStatusSchema,
  author: commentAuthorSchema,
  createdAt: z.string().datetime()
});
export type AdminCommunityMessage = z.infer<typeof adminCommunityMessageSchema>;

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

export const referralSummarySchema = z.object({
  code: z.string(),
  link: z.string().url(),
  availableDays: z.number().int().nonnegative(),
  invitedCount: z.number().int().nonnegative(),
  paidCount: z.number().int().nonnegative(),
  canActivate: z.boolean(),
  activationBlockedReason: z.string().nullable()
});
export type ReferralSummary = z.infer<typeof referralSummarySchema>;

export const referralProfileResponseSchema = z.object({
  referral: referralSummarySchema,
  settings: z.object({
    referralRewardDays: z.number().int().positive().max(3650)
  })
});
export type ReferralProfileResponse = z.infer<typeof referralProfileResponseSchema>;

export const referralActivationResponseSchema = z.object({
  ok: z.boolean(),
  activatedDays: z.number().int().nonnegative(),
  membershipExpiresAt: z.string().datetime().nullable(),
  referral: referralSummarySchema
});
export type ReferralActivationResponse = z.infer<typeof referralActivationResponseSchema>;

export const adminReferralUserSchema = z.object({
  telegramId: z.string(),
  firstName: z.string().nullable(),
  username: z.string().nullable(),
  photoUrl: z.string().url().nullable()
});
export type AdminReferralUser = z.infer<typeof adminReferralUserSchema>;

export const adminUserReferralSchema = z.object({
  id: z.string(),
  invitedAt: z.string().datetime(),
  firstPaidAt: z.string().datetime().nullable(),
  rewardDays: z.number().int().nonnegative(),
  rewardStatus: z.enum(["none", "available", "activated"]),
  invitedUser: adminReferralUserSchema
});
export type AdminUserReferral = z.infer<typeof adminUserReferralSchema>;

export const adminUserInvitedByReferralSchema = z.object({
  id: z.string(),
  invitedAt: z.string().datetime(),
  firstPaidAt: z.string().datetime().nullable(),
  inviterUser: adminReferralUserSchema
});
export type AdminUserInvitedByReferral = z.infer<typeof adminUserInvitedByReferralSchema>;

export const adminUserReferralsSchema = z.object({
  invitedBy: adminUserInvitedByReferralSchema.nullable(),
  invited: z.array(adminUserReferralSchema)
});
export type AdminUserReferrals = z.infer<typeof adminUserReferralsSchema>;

export const adminProjectSettingsSchema = z.object({
  referralRewardDays: z.number().int().positive().max(3650)
});
export type AdminProjectSettings = z.infer<typeof adminProjectSettingsSchema>;

export const adminProjectSettingsResponseSchema = z.object({
  settings: adminProjectSettingsSchema
});
export type AdminProjectSettingsResponse = z.infer<typeof adminProjectSettingsResponseSchema>;

export const adminProjectSettingsMutationResponseSchema = z.object({
  ok: z.boolean(),
  settings: adminProjectSettingsSchema
});
export type AdminProjectSettingsMutationResponse = z.infer<typeof adminProjectSettingsMutationResponseSchema>;

export const deviceInsetSchema = z.object({
  top: z.number().nullable(),
  bottom: z.number().nullable(),
  left: z.number().nullable(),
  right: z.number().nullable()
});

export const deviceDiagnosticsSchema = z.object({
  installationId: z.string().uuid().nullable().optional(),
  capturedAt: z.string().datetime(),
  platform: z.string().nullable(),
  colorScheme: z.string().nullable(),
  userAgent: z.string(),
  screen: z.object({
    width: z.number().nullable(),
    height: z.number().nullable(),
    availWidth: z.number().nullable(),
    availHeight: z.number().nullable(),
    pixelRatio: z.number().nullable()
  }),
  viewport: z.object({
    width: z.number().nullable(),
    height: z.number().nullable()
  }),
  visualViewport: z
    .object({
      width: z.number().nullable(),
      height: z.number().nullable(),
      offsetTop: z.number().nullable(),
      scale: z.number().nullable()
    })
    .nullable(),
  browser: z.object({
    displayMode: z.string().nullable(),
    standalone: z.boolean().nullable(),
    safeAreaInset: deviceInsetSchema.nullable()
  }),
  layoutCalibration: z
    .object({
      bottomOffsetPx: z.number(),
      source: z.enum(["android", "ios", "browser"])
    })
    .nullable()
    .optional(),
  classes: z.array(z.string())
});
export type DeviceDiagnostics = z.infer<typeof deviceDiagnosticsSchema>;

export const deviceDiagnosticsMutationResponseSchema = z.object({
  ok: z.boolean(),
  device: deviceDiagnosticsSchema
});
export type DeviceDiagnosticsMutationResponse = z.infer<typeof deviceDiagnosticsMutationResponseSchema>;

export const adminLoginIpSchema = z.object({
  id: z.string().uuid(),
  ipAddress: z.string().min(1),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  loginCount: z.number().int().positive()
});
export type AdminLoginIp = z.infer<typeof adminLoginIpSchema>;

export const adminLoginIpsResponseSchema = z.object({
  loginIps: z.array(adminLoginIpSchema)
});
export type AdminLoginIpsResponse = z.infer<typeof adminLoginIpsResponseSchema>;

export const adminUserDeviceSchema = z.object({
  id: z.string().uuid(),
  firstSeenAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  diagnostics: deviceDiagnosticsSchema
});
export type AdminUserDevice = z.infer<typeof adminUserDeviceSchema>;

export const adminUserDetailResponseSchema = z.object({
  user: adminStatsUserSchema,
  subscriptions: z.array(adminUserSubscriptionSchema),
  moderationEvents: z.array(adminUserModerationEventSchema),
  device: deviceDiagnosticsSchema.nullable().default(null),
  devices: z.array(adminUserDeviceSchema).default([]),
  referrals: adminUserReferralsSchema.default({ invitedBy: null, invited: [] }),
  learningEngagement: z.array(z.object({
    contentItemId: z.string(),
    title: z.string(),
    categoryTitle: z.string(),
    opens: z.number().int().nonnegative(),
    totalActiveSeconds: z.number().int().nonnegative(),
    videoSeconds: z.number().int().nonnegative(),
    lastViewedAt: z.string().datetime()
  })).default([])
});
export type AdminUserDetailResponse = z.infer<typeof adminUserDetailResponseSchema>;

export const adminStatsResponseSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  activeUsers: z.number().int().nonnegative(),
  completedItems: z.number().int().nonnegative(),
  totalItems: z.number().int().nonnegative(),
  users: z.array(adminStatsUserSchema),
  communityMessages: z.array(adminCommunityMessageSchema).default([]),
  pollStats: z
    .object({
      totalPolls: z.number().int().nonnegative(),
      activePolls: z.number().int().nonnegative(),
      closedPolls: z.number().int().nonnegative(),
      uniqueParticipants: z.number().int().nonnegative(),
      totalVotes: z.number().int().nonnegative(),
      participationPercent: z.number().min(0),
      polls: z.array(
        z.object({
          id: z.string(),
          question: z.string(),
          topicTitle: z.string(),
          isAnonymous: z.boolean(),
          closed: z.boolean(),
          author: commentAuthorSchema,
          startedAt: z.string().datetime(),
          endedAt: z.string().datetime().nullable(),
          totalVoters: z.number().int().nonnegative(),
          options: z.array(z.object({ id: z.string(), text: z.string(), votesCount: z.number().int().nonnegative(), percent: z.number().min(0) }))
        })
      )
    })
    .default({ totalPolls: 0, activePolls: 0, closedPolls: 0, uniqueParticipants: 0, totalVotes: 0, participationPercent: 0, polls: [] })
});
export type AdminStatsResponse = z.infer<typeof adminStatsResponseSchema>;

export const learningEngagementSnapshotSchema = z.object({
  sessionId: z.string().uuid(),
  activeSeconds: z.number().int().min(0).max(86_400),
  videoSeconds: z.number().int().min(0).max(86_400),
  playbackPositionSeconds: z.number().int().min(0).max(86_400).default(0),
  materialId: z.string().uuid().nullable().default(null),
  closed: z.boolean().default(false)
});
export type LearningEngagementSnapshot = z.infer<typeof learningEngagementSnapshotSchema>;

export const learningEngagementCardSchema = z.object({
  contentItemId: z.string(),
  title: z.string(),
  categoryTitle: z.string(),
  viewers: z.number().int().nonnegative(),
  views: z.number().int().nonnegative(),
  engagedViews: z.number().int().nonnegative(),
  totalActiveSeconds: z.number().int().nonnegative(),
  averageActiveSeconds: z.number().int().nonnegative(),
  medianActiveSeconds: z.number().int().nonnegative(),
  quickExits: z.number().int().nonnegative(),
  quickExitPercent: z.number().min(0).max(100),
  videoSeconds: z.number().int().nonnegative(),
  completedUsers: z.number().int().nonnegative(),
  lastViewedAt: z.string().datetime()
});

export const learningEngagementResponseSchema = z.object({
  summary: z.object({
    uniqueViewers: z.number().int().nonnegative(),
    views: z.number().int().nonnegative(),
    medianActiveSeconds: z.number().int().nonnegative(),
    quickExitPercent: z.number().min(0).max(100)
  }),
  cards: z.array(learningEngagementCardSchema)
});
export type LearningEngagementResponse = z.infer<typeof learningEngagementResponseSchema>;

export const learningEngagementUserSchema = z.object({
  userId: z.string(),
  telegramId: z.string(),
  displayName: z.string(),
  email: z.string().email().nullable(),
  opens: z.number().int().nonnegative(),
  totalActiveSeconds: z.number().int().nonnegative(),
  videoSeconds: z.number().int().nonnegative(),
  playbackPositionSeconds: z.number().int().nonnegative(),
  lastViewedAt: z.string().datetime(),
  completed: z.boolean()
});

export const learningEngagementUsersResponseSchema = z.object({
  item: z.object({ id: z.string(), title: z.string(), categoryTitle: z.string() }),
  users: z.array(learningEngagementUserSchema)
});
export type LearningEngagementUsersResponse = z.infer<typeof learningEngagementUsersResponseSchema>;

export const adminLearningMaterialSchema = learningContentSchema.extend({
  isPublished: z.boolean(),
  archivedUntil: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type AdminLearningMaterial = z.infer<typeof adminLearningMaterialSchema>;

export const adminLearningResponseSchema = z.object({
  categories: z.array(learningCategorySchema),
  materials: z.array(adminLearningMaterialSchema),
  deletedMaterials: z.array(adminLearningMaterialSchema).default([])
});
export type AdminLearningResponse = z.infer<typeof adminLearningResponseSchema>;

export const adminLearningMaterialMutationResponseSchema = z.object({
  ok: z.boolean(),
  material: adminLearningMaterialSchema
});
export type AdminLearningMaterialMutationResponse = z.infer<typeof adminLearningMaterialMutationResponseSchema>;

export const learningSaveOperationStatusSchema = z.enum(["processing", "succeeded", "failed"]);
export const learningSaveOperationResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("processing") }),
  z.object({ status: z.literal("succeeded"), material: adminLearningMaterialSchema.nullable() }),
  z.object({ status: z.literal("failed"), errorCode: z.string().nullable().default(null) })
]);
export type LearningSaveOperationResponse = z.infer<typeof learningSaveOperationResponseSchema>;

export const adminLearningDirectUploadPurposeSchema = z.enum(["media", "thumbnail"]);
export type AdminLearningDirectUploadPurpose = z.infer<typeof adminLearningDirectUploadPurposeSchema>;

export const adminLearningDirectUploadRequestSchema = z.object({
  purpose: adminLearningDirectUploadPurposeSchema,
  kind: contentKindSchema.optional(),
  fileName: z.string().trim().min(1).max(160),
  contentType: z.string().trim().min(1).max(160),
  sizeBytes: z.number().int().positive()
});
export type AdminLearningDirectUploadRequest = z.infer<typeof adminLearningDirectUploadRequestSchema>;

export const adminLearningDirectUploadResponseSchema = z.object({
  uploadUrl: z.string().url(),
  objectKey: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  expiresAt: z.string().datetime()
});
export type AdminLearningDirectUploadResponse = z.infer<typeof adminLearningDirectUploadResponseSchema>;

export const adminLearningMultipartUploadResponseSchema = z.object({
  objectKey: z.string(),
  uploadId: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  partSizeBytes: z.number().int().positive(),
  expiresAt: z.string().datetime(),
  parts: z.array(z.object({ partNumber: z.number().int().positive(), uploadUrl: z.string().url() }))
});
export type AdminLearningMultipartUploadResponse = z.infer<typeof adminLearningMultipartUploadResponseSchema>;

export const adminLearningMultipartCompleteRequestSchema = z.object({
  objectKey: z.string(),
  uploadId: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive(),
  parts: z.array(z.object({ partNumber: z.number().int().positive(), etag: z.string().min(1) })).min(1)
});
export type AdminLearningMultipartCompleteRequest = z.infer<typeof adminLearningMultipartCompleteRequestSchema>;

export const adminLearningUploadedObjectSchema = z.object({
  objectKey: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int().positive()
});
export type AdminLearningUploadedObject = z.infer<typeof adminLearningUploadedObjectSchema>;

export const adminServerErrorLogSchema = z.object({
  id: z.string(),
  title: z.string(),
  detail: z.string(),
  path: z.string().nullable(),
  method: z.string().nullable(),
  status: z.number().int().nullable(),
  createdAt: z.string().datetime()
});
export type AdminServerErrorLog = z.infer<typeof adminServerErrorLogSchema>;

export const adminServerErrorsResponseSchema = z.object({
  errors: z.array(adminServerErrorLogSchema)
});
export type AdminServerErrorsResponse = z.infer<typeof adminServerErrorsResponseSchema>;

export const adminServerUsageSchema = z.object({
  usedBytes: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  freeBytes: z.number().int().nonnegative(),
  usedPercent: z.number().min(0).max(100)
});
export type AdminServerUsage = z.infer<typeof adminServerUsageSchema>;

export const adminServerStatusSchema = z.object({
  ok: z.boolean(),
  checkedAt: z.string().datetime(),
  processUptimeSeconds: z.number().int().nonnegative(),
  systemUptimeSeconds: z.number().int().nonnegative(),
  cpuCount: z.number().int().nonnegative(),
  loadAverage: z.array(z.number()).length(3),
  processMemory: z.object({
    rssBytes: z.number().int().nonnegative(),
    heapUsedBytes: z.number().int().nonnegative(),
    heapTotalBytes: z.number().int().nonnegative()
  }),
  systemMemory: adminServerUsageSchema,
  disk: adminServerUsageSchema.nullable(),
  serverErrorCount: z.number().int().nonnegative(),
  requestMetrics: z.object({
    requests: z.number().int().nonnegative(),
    failedRequests: z.number().int().nonnegative(),
    requestsPerMinute: z.number().nonnegative(),
    errorRatePercent: z.number().min(0).max(100),
    averageDurationMs: z.number().nonnegative(),
    p95DurationMs: z.number().nonnegative(),
    maxDurationMs: z.number().nonnegative(),
    windowSeconds: z.number().int().positive()
  })
});
export type AdminServerStatus = z.infer<typeof adminServerStatusSchema>;

export const adminServerStatusResponseSchema = z.object({
  status: adminServerStatusSchema
});
export type AdminServerStatusResponse = z.infer<typeof adminServerStatusResponseSchema>;

export const adminIntegrationHealthItemSchema = z.object({
  id: z.enum(["database", "smtp", "s3", "payments", "realtime"]),
  label: z.string(),
  status: z.enum(["healthy", "warning", "disabled", "error"]),
  detail: z.string()
});
export const adminIntegrationHealthResponseSchema = z.object({
  checkedAt: z.string().datetime(),
  items: z.array(adminIntegrationHealthItemSchema)
});
export type AdminIntegrationHealthResponse = z.infer<typeof adminIntegrationHealthResponseSchema>;

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
  reserveConfigured: z.boolean(),
  reserveEndpoint: z.string().url().nullable(),
  reserveBucket: z.string().nullable(),
  reserveRegion: z.string().nullable(),
  reservePublicBaseUrl: z.string().url().nullable(),
  reserveAccessKeyConfigured: z.boolean(),
  reserveSecretKeyConfigured: z.boolean(),
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

export const s3StorageObjectCategorySchema = z.enum(["learning", "support", "mailings", "notifications", "other"]);

export const s3StorageObjectUploaderSchema = z.object({
  telegramId: z.string(),
  firstName: z.string().nullable(),
  username: z.string().nullable(),
  photoUrl: z.string().url().nullable()
});

export const s3StorageObjectSchema = z.object({
  key: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  lastModified: z.string().datetime().nullable(),
  etag: z.string().nullable(),
  category: s3StorageObjectCategorySchema,
  categoryLabel: z.string(),
  fileKind: z.string(),
  entityTitle: z.string().nullable(),
  uploadedBy: s3StorageObjectUploaderSchema.nullable()
});
export type S3StorageObject = z.infer<typeof s3StorageObjectSchema>;

export const s3StorageObjectsResponseSchema = z.object({
  prefix: z.string(),
  objects: z.array(s3StorageObjectSchema),
  nextCursor: z.string().nullable()
});
export type S3StorageObjectsResponse = z.infer<typeof s3StorageObjectsResponseSchema>;

export const s3StorageObjectUrlResponseSchema = z.object({
  url: z.string().url()
});
export type S3StorageObjectUrlResponse = z.infer<typeof s3StorageObjectUrlResponseSchema>;

export const mailingChannelSchema = z.enum(["push", "email", "push_email"]);
export type MailingChannel = z.infer<typeof mailingChannelSchema>;

export const mailingStatusSchema = z.enum(["draft", "scheduled", "running", "paused", "stopped", "completed"]);
export type MailingStatus = z.infer<typeof mailingStatusSchema>;

export const mailingAccessStatusSchema = z.enum(["all", "active", "inactive"]);
export type MailingAccessStatus = z.infer<typeof mailingAccessStatusSchema>;

export const mailingAccessTypeSchema = z.enum(["all", "manual", "one_time", "recurrent", "none"]);
export type MailingAccessType = z.infer<typeof mailingAccessTypeSchema>;

export const mailingFiltersSchema = z.object({
  accessStatus: mailingAccessStatusSchema.default("active"),
  accessType: mailingAccessTypeSchema.default("all"),
  excludeAdmins: z.boolean().default(true),
  excludeRestricted: z.boolean().default(true)
});
export type MailingFilters = z.infer<typeof mailingFiltersSchema>;

export const mailingAttachmentSchema = z.object({
  kind: z.enum(["photo", "video", "document"]),
  fileName: z.string(),
  url: z.string().url().nullable(),
  contentType: z.string(),
  sizeBytes: z.number().int().nonnegative()
});
export type MailingAttachment = z.infer<typeof mailingAttachmentSchema>;

export const adminMailingSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  bodyHtml: z.string().nullable(),
  channel: mailingChannelSchema,
  filters: mailingFiltersSchema,
  status: mailingStatusSchema,
  scheduledAt: z.string().datetime().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  createdBy: commentAuthorSchema.nullable(),
  targetCount: z.number().int().nonnegative(),
  deliveryCount: z.number().int().nonnegative(),
  sentCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  processingCount: z.number().int().nonnegative(),
  estimatedSeconds: z.number().int().nonnegative(),
  estimatedLabel: z.string(),
  attachment: mailingAttachmentSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});
export type AdminMailing = z.infer<typeof adminMailingSchema>;

export const emailDeliveryQuotaSchema = z.object({
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  windowHours: z.number().int().positive(),
  maxRecipientsPerMessage: z.number().int().positive(),
  messagesPerSecond: z.number().int().positive(),
  resetsAt: z.string().datetime().nullable()
});
export type EmailDeliveryQuota = z.infer<typeof emailDeliveryQuotaSchema>;

export const adminMailingsResponseSchema = z.object({
  mailings: z.array(adminMailingSchema),
  emailQuota: emailDeliveryQuotaSchema
});
export type AdminMailingsResponse = z.infer<typeof adminMailingsResponseSchema>;

const adminMailingAnalyticsSummarySchema = z.object({
  sent: z.number().int().nonnegative(),
  opened: z.number().int().nonnegative(),
  clicked: z.number().int().nonnegative(),
  openRate: z.number().nonnegative(),
  clickRate: z.number().nonnegative(),
  clickToOpenRate: z.number().nonnegative()
});

export const adminMailingAnalyticsSchema = z.object({
  trackingEnabledAt: z.string().datetime().nullable(),
  emailOpenEstimate: z.boolean(),
  summary: adminMailingAnalyticsSummarySchema,
  channels: z.array(z.object({
    channel: z.enum(["push", "email"]),
    sent: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    opened: z.number().int().nonnegative(),
    clicked: z.number().int().nonnegative(),
    openRate: z.number().nonnegative(),
    clickRate: z.number().nonnegative()
  })),
  timeline: z.array(z.object({
    bucket: z.string().datetime(),
    sent: z.number().int().nonnegative(),
    opened: z.number().int().nonnegative(),
    clicked: z.number().int().nonnegative()
  })),
  links: z.array(z.object({ destination: z.string().url(), uniqueClicks: z.number().int().nonnegative() }))
});
export type AdminMailingAnalytics = z.infer<typeof adminMailingAnalyticsSchema>;

export const adminMailingAnalyticsRecipientSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  telegramId: z.string(),
  displayName: z.string(),
  channel: z.enum(["push", "email"]),
  deliveryStatus: z.string(),
  analyticsStatus: z.enum(["delivered", "opened", "clicked", "failed", "skipped", "pending"]),
  attemptCount: z.number().int().nonnegative(),
  error: z.string().nullable(),
  sentAt: z.string().datetime().nullable(),
  openedAt: z.string().datetime().nullable(),
  clickedAt: z.string().datetime().nullable()
});
export type AdminMailingAnalyticsRecipient = z.infer<typeof adminMailingAnalyticsRecipientSchema>;

export const adminMailingAnalyticsRecipientsResponseSchema = z.object({
  recipients: z.array(adminMailingAnalyticsRecipientSchema),
  nextCursor: z.string().uuid().nullable()
});
export type AdminMailingAnalyticsRecipientsResponse = z.infer<typeof adminMailingAnalyticsRecipientsResponseSchema>;

export const adminMailingPreviewResponseSchema = z.object({
  targetCount: z.number().int().nonnegative(),
  deliveryCount: z.number().int().nonnegative(),
  pushCount: z.number().int().nonnegative(),
  pushSubscriptionCount: z.number().int().nonnegative(),
  emailCount: z.number().int().nonnegative(),
  excludedMissingEmail: z.number().int().nonnegative(),
  excludedEmailOptOut: z.number().int().nonnegative(),
  excludedByFilters: z.number().int().nonnegative(),
  estimatedSeconds: z.number().int().nonnegative(),
  estimatedLabel: z.string(),
  emailQuota: emailDeliveryQuotaSchema,
  emailCompletesAt: z.string().datetime().nullable(),
  emailDelayedByDailyLimit: z.boolean()
});
export type AdminMailingPreviewResponse = z.infer<typeof adminMailingPreviewResponseSchema>;

export const adminMailingMutationResponseSchema = z.object({
  ok: z.boolean(),
  mailing: adminMailingSchema
});
export type AdminMailingMutationResponse = z.infer<typeof adminMailingMutationResponseSchema>;

export const appNotificationSchema = z.object({
  id: z.string(),
  kind: z.enum(["system", "support", "payment", "client", "mailing"]),
  title: z.string(),
  body: z.string(),
  bodyHtml: z.string().nullable(),
  source: z.string().nullable(),
  sourceId: z.string().nullable(),
  attachment: mailingAttachmentSchema.nullable(),
  readAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime()
});
export type AppNotification = z.infer<typeof appNotificationSchema>;

export const appNotificationsResponseSchema = z.object({
  notifications: z.array(appNotificationSchema),
  unreadCount: z.number().int().nonnegative()
});
export type AppNotificationsResponse = z.infer<typeof appNotificationsResponseSchema>;

export const appNotificationMutationResponseSchema = z.object({
  ok: z.boolean(),
  unreadCount: z.number().int().nonnegative()
});
export type AppNotificationMutationResponse = z.infer<typeof appNotificationMutationResponseSchema>;
