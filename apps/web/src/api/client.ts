import type {
  AdminAccessMutationResponse,
  AcquisitionAttribution,
  AcquisitionLinkInput,
  AdminAcquisitionDashboard,
  AdminAcquisitionDayDetail,
  AdminAcquisitionLink,
  AdminUserAcquisition,
  AdminActionLogsResponse,
  AdminMailingMutationResponse,
  AdminMailingAnalytics,
  AdminMailingAnalyticsRecipientsResponse,
  AdminMailingPreviewResponse,
  AdminMailingsResponse,
  AdminLearningCategoryMutationResponse,
  AdminLearningDirectUploadRequest,
  AdminLearningDirectUploadResponse,
  AdminLearningMultipartCompleteRequest,
  AdminLearningMultipartUploadResponse,
  AdminLearningMaterialMutationResponse,
  AdminLearningUploadedObject,
  AdminLearningResponse,
  AdminPaymentProviderResponse,
  AdminPaymentProvidersResponse,
  AdminProjectSettingsMutationResponse,
  AdminProjectSettingsResponse,
  OwnerEmailLoginCodeResponse,
  AdminListResponse,
  AdminModerationResponse,
  AdminUserDetailResponse,
  AdminLoginIpsResponse,
  ClubChatMutationResponse,
  ClubChatsResponse,
  ClubMessageMutationResponse,
  ClubMessageReactionMutationResponse,
  ClubMessagesResponse,
  ClubTopicMutationResponse,
  ClubTopicsResponse,
  AdminMutationResponse,
  AdminServerErrorsResponse,
  AdminServerStatusResponse,
  AdminIntegrationHealthResponse,
  AdminErrorTrackerSummary,
  AdminErrorTrackerListResponse,
  AdminErrorTrackerDetailResponse,
  AdminErrorTrackerSettings,
  AdminFinanceAnalyticsResponse,
  ErrorTrackerSeverity,
  ErrorTrackerSource,
  ErrorTrackerStatus,
  AdminStatsResponse,
  AdminStatsUser,
  LearningContentResponse,
  LearningEngagementSnapshot,
  LearningEngagementResponse,
  LearningEngagementUsersResponse,
  LearningFavoriteMutationResponse,
  LearningSaveOperationResponse,
  LessonCommentMutationResponse,
  LessonCommentsResponse,
  LearningHomeResponse,
  LearningPlaybackMutationResponse,
  LearningProgressMutationResponse,
  LessonAssessmentDraft,
  MessageReaction,
  PaymentsResponse,
  PaymentOrderLogsResponse,
  PaymentProductMutationResponse,
  PaymentProductProviderBinding,
  PaymentProviderCatalogResponse,
  PaymentProviderCode,
  PaymentCurrency,
  PaymentProviderMutationResponse,
  AdminIndividualPaymentOfferPayload,
  AdminIndividualPaymentOfferCreateResponse,
  IndividualPaymentOfferCheckoutResponse,
  IndividualPaymentOfferDetailResponse,
  IndividualPaymentOfferOptionsResponse,
  IndividualPaymentOffersResponse,
  S3StorageObjectUrlResponse,
  S3StorageObjectsResponse,
  S3StorageSettingsMutationResponse,
  S3StorageSettingsResponse,
  SubscribeResponse,
  SupportHomeResponse,
  AdminSupportResponse,
  AdminPermission,
  SupportTicketMutationResponse,
  SupportUnreadResponse,
  SupportUploadIntent,
  SupportUploadIntentResponse,
  SupportUploadedObject
} from "@club/shared";
import { getCommunityVoiceUploadFileName } from "../features/community/voiceUpload";
import { api, apiUrl, getApiRequestHeaders, previewModeStorageKey } from "./http";
export { api, getApiRequestHeaders } from "./http";
export {
  activateReferralRewards,
  clearAppNotifications,
  createAvatarUploadFormData,
  createCheckout,
  deleteWebPushSubscription,
  getAppNotifications,
  getAppState,
  getMe,
  getPaymentHistory,
  getReferralProfile,
  getWebPushPublicKey,
  logoutSession,
  markAppNotificationRead,
  markAppNotificationsRead,
  recordAcquisitionVisit,
  refreshAvatar,
  reportClientError,
  requestEmailCode,
  saveWebPushSubscription,
  updateAvatarDisplay,
  updateDeviceDiagnostics,
  updateDisplayName,
  uploadAvatar,
  verifyEmailCode,
  type AvatarDisplayDraft
} from "./startup";

export function createPaymentCheckout(productId: string, provider?: PaymentProviderCode, currency?: PaymentCurrency) {
  return api<SubscribeResponse>("/payments/checkout", {
    method: "POST",
    body: { productId, ...(provider ? { provider } : {}), ...(currency ? { currency } : {}) }
  });
}

export function getIndividualPaymentOffer(token: string) {
  return api<IndividualPaymentOfferDetailResponse>(`/payments/offers/${encodeURIComponent(token)}`);
}

export function createIndividualPaymentOfferCheckout(token: string) {
  return api<IndividualPaymentOfferCheckoutResponse>(`/payments/offers/${encodeURIComponent(token)}/checkout`, { method: "POST" });
}

export function getAdminIndividualPaymentOfferOptions(telegramId: string) {
  return api<IndividualPaymentOfferOptionsResponse>(`/admin/individual-payment-offers/users/${encodeURIComponent(telegramId)}/options`);
}

export function getAdminIndividualPaymentOffers(telegramId: string) {
  return api<IndividualPaymentOffersResponse>(`/admin/individual-payment-offers/users/${encodeURIComponent(telegramId)}`);
}

export function createAdminIndividualPaymentOffer(telegramId: string, payload: AdminIndividualPaymentOfferPayload) {
  return api<AdminIndividualPaymentOfferCreateResponse>(`/admin/individual-payment-offers/users/${encodeURIComponent(telegramId)}`, {
    method: "POST",
    body: payload
  });
}

export function cancelAdminIndividualPaymentOffer(telegramId: string, offerId: string) {
  return api<{ ok: true }>(`/admin/individual-payment-offers/users/${encodeURIComponent(telegramId)}/${encodeURIComponent(offerId)}/cancel`, { method: "POST" });
}

export function getLearningHome() {
  return api<LearningHomeResponse>("/learning");
}

export function dismissHomeworkReviewNotice(submissionId: string) {
  return api<{ ok: true }>(`/learning/homework-reviews/${encodeURIComponent(submissionId)}/dismiss`, {
    method: "POST"
  });
}

export function getLearningContent(id: string) {
  return api<LearningContentResponse>(`/learning/items/${id}`);
}

export function completeLearningContent(id: string, options: { keepalive?: boolean } = {}) {
  return api<LearningProgressMutationResponse>(`/learning/items/${id}/complete`, {
    method: "POST",
    ...(options.keepalive ? { keepalive: true } : {})
  });
}

export function saveLearningPlayback(id: string, positionSeconds: number, options: { keepalive?: boolean; materialId?: string | null } = {}) {
  const fetchOptions = {
    method: "POST",
    body: {
      positionSeconds,
      ...(options.materialId !== undefined ? { materialId: options.materialId } : {})
    },
    ...(options.keepalive ? { keepalive: true } : {})
  };

  return api<LearningPlaybackMutationResponse>(`/learning/items/${id}/playback`, fetchOptions);
}

export function saveLearningEngagement(id: string, snapshot: LearningEngagementSnapshot, options: { keepalive?: boolean } = {}) {
  return api<{ ok: true }>(`/learning/items/${id}/engagement`, {
    method: "POST",
    body: snapshot,
    ...(options.keepalive ? { keepalive: true } : {})
  });
}

export function getLessonComments(id: string) {
  return api<LessonCommentsResponse>(`/learning/items/${id}/comments`);
}

export function setLearningFavorite(id: string, favorite: boolean) {
  return api<LearningFavoriteMutationResponse>(`/learning/items/${id}/favorite`, {
    method: favorite ? "PUT" : "DELETE"
  });
}

export function createLessonComment(id: string, body: string) {
  return api<LessonCommentMutationResponse>(`/learning/items/${id}/comments`, {
    method: "POST",
    body: { body }
  });
}

export function getClubChats() {
  return api<ClubChatsResponse>("/community/chats");
}

export function createClubChat(payload: { title: string; description?: string | null }) {
  return api<ClubChatMutationResponse>("/community/chats", {
    method: "POST",
    body: payload
  });
}

export function getClubTopics(chatId: string) {
  return api<ClubTopicsResponse>(`/community/chats/${chatId}/topics`);
}

export function getCommunityTopics() {
  return api<ClubTopicsResponse>("/community/topics");
}

export function createCommunityEventSource() {
  const params = new URLSearchParams();
  params.set("pwa", "1");
  const previewMode = localStorage.getItem(previewModeStorageKey);
  if (
    previewMode === "developer" ||
    previewMode === "admin" ||
    previewMode === "member-active" ||
    previewMode === "member-inactive"
  ) {
    params.set("preview", previewMode);
  }

  return new EventSource(`${apiUrl.replace(/\/$/, "")}/community/events?${params.toString()}`, {
    withCredentials: true
  });
}

export function createClubTopic(chatId: string, payload: { title: string; description?: string | null; isAdminOnly?: boolean }) {
  return api<ClubTopicMutationResponse>(`/community/chats/${chatId}/topics`, {
    method: "POST",
    body: payload
  });
}

export function createCommunityTopic(payload: { title: string; description?: string | null; isAdminOnly?: boolean }) {
  return api<ClubTopicMutationResponse>("/community/topics", {
    method: "POST",
    body: payload
  });
}

export function updateClubTopicSettings(topicId: string, payload: { isLocked?: boolean; isPublished?: boolean }) {
  return api<ClubTopicMutationResponse>(`/community/topics/${topicId}/settings`, {
    method: "POST",
    body: payload
  });
}

export function getClubMessages(topicId: string, before?: string | null) {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return api<ClubMessagesResponse>(`/community/topics/${topicId}/messages${query}`);
}

export function deleteTopicMessages(topicId: string) {
  return api<AdminMutationResponse>(`/community/topics/${topicId}/messages/delete-all`, {
    method: "POST"
  });
}

export function deleteTopicAuthorMessages(topicId: string, telegramId: string) {
  return api<AdminMutationResponse>(`/community/topics/${topicId}/messages/delete-author`, {
    method: "POST",
    body: { telegramId }
  });
}

export function createClubMessage(topicId: string, body: string, replyToMessageId?: string | null) {
  return api<ClubMessageMutationResponse>(`/community/topics/${topicId}/messages`, {
    method: "POST",
    body: { body, replyToMessageId: replyToMessageId ?? null }
  });
}

export function createClubVoiceMessage(topicId: string, file: Blob, durationSeconds: number, replyToMessageId?: string | null) {
  const form = new FormData();
  form.set("voice", file, file instanceof File && file.name ? file.name : getCommunityVoiceUploadFileName(file.type));
  form.set("durationSeconds", String(Math.max(1, Math.round(durationSeconds))));
  if (replyToMessageId) form.set("replyToMessageId", replyToMessageId);
  return api<ClubMessageMutationResponse>(`/community/topics/${topicId}/messages/voice`, { method: "POST", body: form });
}

export function createClubImageMessage(topicId: string, files: File[], replyToMessageId?: string | null) {
  const form = new FormData();
  files.forEach((file) => form.append("images", file, file.name));
  if (replyToMessageId) form.set("replyToMessageId", replyToMessageId);
  return api<ClubMessageMutationResponse>(`/community/topics/${topicId}/messages/images`, { method: "POST", body: form });
}

export function createClubPoll(
  topicId: string,
  payload: { question: string; options: string[]; allowsMultiple: boolean; isAnonymous: boolean; closesAt?: string | null; replyToMessageId?: string | null }
) {
  return api<ClubMessageMutationResponse>(`/community/topics/${topicId}/messages/poll`, { method: "POST", body: payload });
}

export function voteInClubPoll(pollId: string, optionIds: string[]) {
  return api<ClubMessageMutationResponse>(`/community/polls/${pollId}/votes`, { method: "POST", body: { optionIds } });
}

export function closeClubPoll(pollId: string) {
  return api<ClubMessageMutationResponse>(`/community/polls/${pollId}/close`, { method: "POST" });
}

export function reactToClubMessage(messageId: string, reaction: MessageReaction | null) {
  return api<ClubMessageReactionMutationResponse>(`/community/messages/${messageId}/reaction`, {
    method: "POST",
    body: { reaction }
  });
}

export function setClubMessagePinned(messageId: string, pinned: boolean) {
  return api<ClubMessageMutationResponse>(`/community/messages/${messageId}/pin`, {
    method: "POST",
    body: { pinned }
  });
}

export function createTopicUserMute(
  topicId: string,
  payload: { telegramId: string; kind: "temporary" | "permanent"; reason?: string | null; expiresAt?: string | null }
) {
  return api<ClubMessageMutationResponse>(`/community/topics/${topicId}/mutes`, {
    method: "POST",
    body: payload
  });
}

export function revokeTopicUserMute(topicId: string, muteId: string) {
  return api<ClubMessageMutationResponse>(`/community/topics/${topicId}/mutes/${muteId}`, {
    method: "DELETE"
  });
}

export function getPaymentPlans() {
  return api<PaymentsResponse>("/payments/plans");
}

export function cancelRecurrentSubscription(id: string) {
  return api<AdminMutationResponse>(`/payments/recurrent-subscriptions/${id}/cancel`, {
    method: "POST"
  });
}

export function restoreRecurrentSubscription(id: string) {
  return api<AdminMutationResponse>(`/payments/recurrent-subscriptions/${id}/restore`, {
    method: "POST"
  });
}

export function getAdminPaymentHistory() {
  return api<PaymentOrderLogsResponse>("/payments/admin/orders");
}

export function getAdminS3StorageSettings() {
  return api<S3StorageSettingsResponse>("/admin/storage/s3");
}

export function updateAdminS3StorageSettings(payload: {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  publicBaseUrl?: string | null;
  reserveEndpoint?: string;
  reserveRegion?: string;
  reserveBucket?: string;
  reserveAccessKeyId?: string;
  reserveSecretAccessKey?: string;
  reservePublicBaseUrl?: string | null;
  signedUrlTtlSeconds: number;
}) {
  return api<S3StorageSettingsMutationResponse>("/admin/storage/s3", {
    method: "POST",
    body: payload
  });
}

export function getAdminS3Objects(prefix = "", cursor?: string | null, target: "primary" | "reserve" = "primary") {
  const query = new URLSearchParams();
  query.set("target", target);
  if (prefix) {
    query.set("prefix", prefix);
  }
  if (cursor) {
    query.set("cursor", cursor);
  }

  const suffix = query.toString();
  return api<S3StorageObjectsResponse>(`/admin/storage/s3/objects${suffix ? `?${suffix}` : ""}`);
}

export function getAdminS3ObjectUrl(key: string, target: "primary" | "reserve" = "primary") {
  return api<S3StorageObjectUrlResponse>("/admin/storage/s3/objects/url", {
    method: "POST",
    body: { key, target }
  });
}

export function deleteAdminS3Object(key: string, target: "primary" | "reserve" = "primary") {
  return api<AdminMutationResponse>("/admin/storage/s3/objects", {
    method: "DELETE",
    body: { key, target }
  });
}

export function getPaymentProvider() {
  return api<AdminPaymentProviderResponse>("/payments/admin/provider");
}

export function saveProdamusProvider(payload: { formUrl: string; secretKey?: string; sys?: string; isEnabled?: boolean }) {
  return api<PaymentProviderMutationResponse>("/payments/admin/provider/prodamus", {
    method: "POST",
    body: payload
  });
}

export function getPaymentProviders() {
  return api<AdminPaymentProvidersResponse>("/payments/admin/providers");
}

export function saveLavaProvider(payload: { apiKey?: string; webhookSecret?: string; testBuyerEmail?: string | null; isEnabled?: boolean }) {
  return api<PaymentProviderMutationResponse>("/payments/admin/providers/lava", {
    method: "POST",
    body: payload
  });
}

export function revealLavaWebhookSecret() {
  return api<{ ok: true; webhookSecret: string }>("/payments/admin/providers/lava/webhook-secret", {
    method: "POST"
  });
}

export function checkLavaProvider() {
  return api<PaymentProviderMutationResponse>("/payments/admin/providers/lava/check", {
    method: "POST"
  });
}

export function syncLavaCatalog() {
  return api<{ ok: true; count: number }>("/payments/admin/providers/lava/catalog/sync", {
    method: "POST"
  });
}

export function getLavaCatalog() {
  return api<PaymentProviderCatalogResponse>("/payments/admin/providers/lava/catalog");
}

export function updateLavaCatalogItemSelection(id: string, isSelectable: boolean) {
  return api<AdminMutationResponse>(`/payments/admin/providers/lava/catalog/${encodeURIComponent(id)}/selection`, {
    method: "POST",
    body: { isSelectable }
  });
}

export function createPaymentProduct(payload: {
  kind: "one_time" | "recurrent";
  title: string;
  description?: string | null;
  badgeLabel?: string | null;
  amountRub: number | null;
  accessDays: number;
  prodamusSubscriptionId?: string | null;
  bindings?: PaymentProductProviderBinding[];
  isPublished?: boolean;
}) {
  return api<PaymentProductMutationResponse>("/payments/admin/products", {
    method: "POST",
    body: payload
  });
}

export function updatePaymentProduct(
  id: string,
  payload: {
    kind: "one_time" | "recurrent";
    title: string;
    description?: string | null;
    badgeLabel?: string | null;
    amountRub: number | null;
    accessDays: number;
    prodamusSubscriptionId?: string | null;
    bindings?: PaymentProductProviderBinding[];
    isPublished?: boolean;
  }
) {
  return api<PaymentProductMutationResponse>(`/payments/admin/products/${id}`, {
    method: "POST",
    body: payload
  });
}

export function updatePaymentProductStatus(id: string, isPublished: boolean) {
  return api<PaymentProductMutationResponse>(`/payments/admin/products/${id}/status`, {
    method: "POST",
    body: { isPublished }
  });
}

export function deletePaymentProduct(id: string) {
  return api<AdminMutationResponse>(`/payments/admin/products/${id}`, {
    method: "DELETE"
  });
}

export function getSupportHome() {
  return api<SupportHomeResponse>("/support");
}

export function getSupportUnreadCount() {
  return api<SupportUnreadResponse>("/support/unread");
}

export function createSupportUploadIntent(payload: SupportUploadIntent) {
  return api<SupportUploadIntentResponse>("/support/uploads", { method: "POST", body: payload });
}

export function createSupportTicket(payload: { topic: string; customTopic: string; message: string; attachments: SupportUploadedObject[] }) {
  return api<SupportTicketMutationResponse>("/support/tickets", {
    method: "POST",
    body: payload
  });
}

export function createSupportTicketMessage(id: string, payload: { message: string; attachments: SupportUploadedObject[] }) {
  return api<SupportTicketMutationResponse>(`/support/tickets/${id}/messages`, {
    method: "POST",
    body: payload
  });
}

export function closeSupportTicket(id: string) {
  return api<SupportTicketMutationResponse>(`/support/tickets/${id}/close`, {
    method: "POST"
  });
}

export function markSupportTicketRead(id: string) {
  return api<SupportTicketMutationResponse>(`/support/tickets/${id}/read`, {
    method: "POST"
  });
}

export function getAdminSupportTickets() {
  return api<AdminSupportResponse>("/support/admin/tickets");
}

export function replyAdminSupportTicket(id: string, payload: { message: string; attachments: SupportUploadedObject[] }) {
  return api<SupportTicketMutationResponse>(`/support/admin/tickets/${id}/replies`, {
    method: "POST",
    body: payload
  });
}

export function createAdminClientSupportTicket(telegramId: string, payload: { message: string; attachments: SupportUploadedObject[] }) {
  return api<SupportTicketMutationResponse>(`/support/admin/users/${telegramId}/tickets`, {
    method: "POST",
    body: payload
  });
}

export function getAdminUsers() {
  return api<AdminListResponse>("/admin/admins");
}

export function getAdminActionLogs(actorTelegramId?: string) {
  return actorTelegramId
    ? api<AdminActionLogsResponse>("/admin/action-logs", { query: { actorTelegramId } })
    : api<AdminActionLogsResponse>("/admin/action-logs");
}

export function getAdminServerErrors() {
  return api<AdminServerErrorsResponse>("/admin/server-errors");
}

export function getAdminErrorTrackerSummary() {
  return api<AdminErrorTrackerSummary>("/admin/error-tracker/summary");
}

export function createAdminErrorTrackerTestIncident() {
  return api<{ ok: true; groupId: string }>("/admin/error-tracker/test", { method: "POST" });
}

export function getAdminErrorGroups(filters: { status?: ErrorTrackerStatus; severity?: ErrorTrackerSeverity; source?: ErrorTrackerSource } = {}) {
  return api<AdminErrorTrackerListResponse>("/admin/error-tracker/groups", { query: filters });
}

export function getAdminErrorGroup(id: string) {
  return api<AdminErrorTrackerDetailResponse>(`/admin/error-tracker/groups/${id}`);
}

export function updateAdminErrorGroupStatus(id: string, status: ErrorTrackerStatus) {
  return api<{ group: AdminErrorTrackerDetailResponse["group"] }>(`/admin/error-tracker/groups/${id}/status`, { method: "PATCH", body: { status } });
}

export function getAdminErrorTrackerSettings() {
  return api<AdminErrorTrackerSettings>("/admin/error-tracker/settings");
}

export function updateAdminErrorTrackerSettings(payload: AdminErrorTrackerSettings) {
  return api<AdminErrorTrackerSettings>("/admin/error-tracker/settings", { method: "PATCH", body: payload });
}

export function getAdminServerStatus() {
  return api<AdminServerStatusResponse>("/admin/server-status");
}

export function getAdminIntegrationHealth() {
  return api<AdminIntegrationHealthResponse>("/admin/integration-health");
}

export function getAdminSettingsAudit() {
  return api<AdminActionLogsResponse>("/admin/settings-audit");
}

export function getAdminProjectSettings() {
  return api<AdminProjectSettingsResponse>("/admin/project-settings");
}

export function updateAdminProjectSettings(payload: { referralRewardDays: number }) {
  return api<AdminProjectSettingsMutationResponse>("/admin/project-settings", {
    method: "POST",
    body: payload
  });
}

export function generateOwnerEmailLoginCode(payload: { email: string }) {
  return api<OwnerEmailLoginCodeResponse>("/admin/owner-email-login-code", {
    method: "POST",
    body: payload
  });
}

function getFileNameFromContentDisposition(value: string | null, fallback: string) {
  const match = value?.match(/filename="?(?<fileName>[^";]+)"?/);
  return match?.groups?.fileName || fallback;
}

function buildAbsoluteApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const base = apiUrl.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (/^https?:\/\//i.test(base)) {
    return `${base}${normalizedPath}`;
  }

  return new URL(`${base}${normalizedPath}`, window.location.origin).toString();
}

export async function downloadAdminDatabaseBackup() {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/admin/database/backup`, {
    headers: getApiRequestHeaders(),
    credentials: "include"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Не удалось скачать базу.");
  }

  return {
    blob: await response.blob(),
    fileName: getFileNameFromContentDisposition(response.headers.get("content-disposition"), "club-database.dump")
  };
}

export async function createAdminDatabaseBackupDownloadLink() {
  const response = await api<{ url: string; expiresAt: string }>("/admin/database/backup-link", {
    method: "POST"
  });

  return {
    ...response,
    url: buildAbsoluteApiUrl(response.url)
  };
}

export function restoreAdminDatabaseBackup(payload: { file: File; confirmation: string }) {
  const form = new FormData();
  form.append("backup", payload.file);
  form.append("confirmation", payload.confirmation);

  return api<AdminMutationResponse>("/admin/database/restore", {
    method: "POST",
    body: form
  });
}

export function getAdminMailings() {
  return api<AdminMailingsResponse>("/admin/mailings");
}

export function previewAdminMailing(payload: { channel: "push" | "email" | "push_email"; filters: unknown }) {
  return api<AdminMailingPreviewResponse>("/admin/mailings/preview", {
    method: "POST",
    body: payload
  });
}

export function createAdminMailing(payload: FormData) {
  return api<AdminMailingMutationResponse>("/admin/mailings", {
    method: "POST",
    body: payload
  });
}

export function testAdminMailingDraft(payload: FormData) {
  return api<AdminMutationResponse>("/admin/mailings/test-draft", {
    method: "POST",
    body: payload
  });
}

export function testAdminMailing(id: string) {
  return api<AdminMailingMutationResponse>(`/admin/mailings/${id}/test`, { method: "POST" });
}

export function pauseAdminMailing(id: string) {
  return api<AdminMailingMutationResponse>(`/admin/mailings/${id}/pause`, { method: "POST" });
}

export function resumeAdminMailing(id: string) {
  return api<AdminMailingMutationResponse>(`/admin/mailings/${id}/resume`, { method: "POST" });
}

export function stopAdminMailing(id: string) {
  return api<AdminMailingMutationResponse>(`/admin/mailings/${id}/stop`, { method: "POST" });
}

export function retryFailedAdminMailing(id: string) {
  return api<AdminMailingMutationResponse>(`/admin/mailings/${id}/retry-failed`, { method: "POST" });
}

export function getAdminMailingAnalytics(id: string) {
  return api<AdminMailingAnalytics>(`/admin/mailings/${id}/analytics`);
}

export function getAdminMailingAnalyticsRecipients(
  id: string,
  query: { status: string; channel: string; limit?: number; cursor?: string | null },
) {
  const params = new URLSearchParams({ status: query.status, channel: query.channel, limit: String(query.limit ?? 20) });
  if (query.cursor) params.set("cursor", query.cursor);
  return api<AdminMailingAnalyticsRecipientsResponse>(`/admin/mailings/${id}/recipients?${params.toString()}`);
}

export function addAdminUser(telegramId: string) {
  return api<AdminMutationResponse>("/admin/admins", {
    method: "POST",
    body: { telegramId }
  });
}

export function updateAdminUserPermissions(
  telegramId: string,
  payload: { roleLabel?: string | null; isActive?: boolean; permissions?: AdminPermission[] }
) {
  return api<AdminMutationResponse>(`/admin/admins/${telegramId}`, {
    method: "PATCH",
    body: payload
  });
}

export function removeAdminUser(telegramId: string) {
  return api<AdminMutationResponse>(`/admin/admins/${telegramId}`, {
    method: "DELETE"
  });
}

export function transferClubOwner(telegramId: string) {
  return api<AdminMutationResponse>("/admin/owner/transfer", {
    method: "POST",
    body: { telegramId }
  });
}

export function getAdminStats() {
  return api<AdminStatsResponse>("/admin/stats");
}

export function getAdminFinanceAnalytics(options: { from?: string; to?: string } = {}) {
  const query = new URLSearchParams();
  if (options.from) query.set("from", options.from);
  if (options.to) query.set("to", options.to);
  return api<AdminFinanceAnalyticsResponse>(`/admin/analytics/finance${query.size ? `?${query}` : ""}`);
}

export function getAdminLearningEngagement(options: { from?: string; to?: string } = {}) {
  const query = new URLSearchParams();
  if (options.from) query.set("from", options.from);
  if (options.to) query.set("to", options.to);
  return api<LearningEngagementResponse>(`/admin/analytics/learning-engagement${query.size ? `?${query}` : ""}`);
}

export function getAdminLearningEngagementUsers(itemId: string, options: { from?: string; to?: string } = {}) {
  const query = new URLSearchParams();
  if (options.from) query.set("from", options.from);
  if (options.to) query.set("to", options.to);
  return api<LearningEngagementUsersResponse>(`/admin/analytics/learning-engagement/${encodeURIComponent(itemId)}/users${query.size ? `?${query}` : ""}`);
}

export function getAdminAcquisitionDashboard(options: { from?: string; to?: string; attribution: AcquisitionAttribution }) {
  const query = new URLSearchParams({ attribution: options.attribution });
  if (options.from) query.set("from", options.from);
  if (options.to) query.set("to", options.to);
  return api<AdminAcquisitionDashboard>(`/admin/acquisition/dashboard?${query}`);
}

export function getAdminAcquisitionDay(date: string) {
  return api<AdminAcquisitionDayDetail>(`/admin/acquisition/day?date=${encodeURIComponent(date)}`);
}

export function getAdminAcquisitionLinks() {
  return api<{ links: AdminAcquisitionLink[] }>("/admin/acquisition/links");
}

export function createAdminAcquisitionLink(payload: AcquisitionLinkInput) {
  return api<AdminAcquisitionLink>("/admin/acquisition/links", { method: "POST", body: payload });
}

export function updateAdminAcquisitionLinkStatus(id: string, isActive: boolean) {
  return api<AdminAcquisitionLink>(`/admin/acquisition/links/${id}`, { method: "PATCH", body: { isActive } });
}

export function getAdminUserAcquisition(telegramId: string) {
  return api<AdminUserAcquisition | null>(`/admin/users/${encodeURIComponent(telegramId)}/acquisition`);
}

export function getAdminUserStats(telegramId: string) {
  return api<AdminStatsUser>(`/admin/stats/users/${telegramId}`);
}

export function getAdminUserDetail(telegramId: string) {
  return api<AdminUserDetailResponse>(`/admin/stats/users/${telegramId}/detail`);
}

export function updateAdminUserDisplayName(telegramId: string, displayName: string) {
  return api<AdminStatsUser>(`/admin/stats/users/${telegramId}/display-name`, { method: "PATCH", body: { displayName } });
}

export function getAdminUserLoginIps(telegramId: string) {
  return api<AdminLoginIpsResponse>(`/admin/login-ips/${telegramId}`);
}

export function updateAdminUserAccess(payload: { telegramId: string; status: "inactive" | "active" | "expired"; expiresAt?: string | null }) {
  return api<AdminAccessMutationResponse>("/admin/access", {
    method: "POST",
    body: payload
  });
}

export function getAdminModeration() {
  return api<AdminModerationResponse>("/admin/moderation");
}

export function updateModerationStatus(kind: "lesson_comment" | "chat_message", id: string, status: "visible" | "hidden" | "deleted") {
  return api<AdminMutationResponse>(`/admin/moderation/${kind}/${id}/status`, {
    method: "POST",
    body: { status }
  });
}

export function createUserMute(payload: { telegramId: string; kind: "temporary" | "permanent"; reason?: string | null; expiresAt?: string | null }) {
  return api<AdminMutationResponse>("/admin/mutes", {
    method: "POST",
    body: payload
  });
}

export function revokeUserMute(id: string) {
  return api<AdminMutationResponse>(`/admin/mutes/${id}`, {
    method: "DELETE"
  });
}

export function getAdminLearning() {
  return api<AdminLearningResponse>("/admin/learning");
}

export function reorderAdminLearningCategories(ids: string[]) {
  return api<AdminMutationResponse>("/admin/learning/categories/reorder", {
    method: "POST",
    body: { ids }
  });
}

export function reorderAdminLearningMaterials(categoryId: string, ids: string[]) {
  return api<AdminMutationResponse>("/admin/learning/materials/reorder", {
    method: "POST",
    body: { categoryId, ids }
  });
}

export function createAdminLearningMaterial(payload: FormData) {
  return api<AdminLearningMaterialMutationResponse>("/admin/learning/materials", {
    method: "POST",
    body: payload
  });
}

export function createAdminLearningUpload(payload: AdminLearningDirectUploadRequest) {
  return api<AdminLearningDirectUploadResponse>("/admin/learning/materials/uploads", {
    method: "POST",
    body: payload
  });
}

export function createAdminLearningMultipartUpload(payload: AdminLearningDirectUploadRequest) {
  return api<AdminLearningMultipartUploadResponse>("/admin/learning/materials/uploads/multipart", {
    method: "POST",
    body: payload
  });
}

export function completeAdminLearningMultipartUpload(payload: AdminLearningMultipartCompleteRequest) {
  return api<AdminLearningUploadedObject>("/admin/learning/materials/uploads/multipart/complete", {
    method: "POST",
    body: payload
  });
}

export function createAdminLearningMaterialDirect(payload: {
  categoryId: string;
  kind: "text" | "photo" | "video" | "audio";
  title: string;
  summary?: string;
  body?: string;
  materials?: Array<{
    id?: string;
    kind: "text" | "photo" | "video" | "audio";
    title: string;
    description?: string;
    body?: string;
    mediaUrl?: string | null;
    mediaObject?: AdminLearningUploadedObject | null;
  }>;
  cardLayout: "vertical" | "horizontal";
  coverMode: "default" | "custom" | "first_material";
  isPublished: boolean;
  mediaUrl?: string | null;
  mediaObject?: AdminLearningUploadedObject | null;
  thumbnailObject?: AdminLearningUploadedObject | null;
  removeThumbnail?: boolean;
}, options: { idempotencyKey?: string } = {}) {
  return api<AdminLearningMaterialMutationResponse>("/admin/learning/materials/direct", {
    method: "POST",
    body: payload,
    ...(options.idempotencyKey ? { headers: { "Idempotency-Key": options.idempotencyKey } } : {})
  });
}

export function getAdminLearningMaterialOperation(idempotencyKey: string) {
  return api<LearningSaveOperationResponse>(`/admin/learning/materials/operations/${encodeURIComponent(idempotencyKey)}`);
}

export function updateAdminLearningMaterial(id: string, payload: FormData) {
  return api<AdminLearningMaterialMutationResponse>(`/admin/learning/materials/${id}`, {
    method: "POST",
    body: payload
  });
}

export function updateAdminLearningMaterialDirect(
  id: string,
  payload: {
    categoryId: string;
    kind: "text" | "photo" | "video" | "audio";
    title: string;
    summary?: string;
    body?: string;
    materials?: Array<{
      id?: string;
      kind: "text" | "photo" | "video" | "audio";
      title: string;
      description?: string;
      body?: string;
      mediaUrl?: string | null;
      mediaObject?: AdminLearningUploadedObject | null;
    }>;
    cardLayout: "vertical" | "horizontal";
    coverMode: "default" | "custom" | "first_material";
    isPublished: boolean;
    mediaUrl?: string | null;
    mediaObject?: AdminLearningUploadedObject | null;
    thumbnailObject?: AdminLearningUploadedObject | null;
    removeThumbnail?: boolean;
  }
) {
  return api<AdminLearningMaterialMutationResponse>(`/admin/learning/materials/${id}/direct`, {
    method: "POST",
    body: payload
  });
}

export function createAdminLearningCategory(payload: { title: string; description?: string | null; defaultCardLayout?: "vertical" | "horizontal"; isPublished?: boolean }) {
  return api<AdminLearningCategoryMutationResponse>("/admin/learning/categories", {
    method: "POST",
    body: payload
  });
}

export function updateAdminLearningCategory(id: string, payload: { title: string; description?: string | null; defaultCardLayout?: "vertical" | "horizontal"; isPublished?: boolean }) {
  return api<AdminLearningCategoryMutationResponse>(`/admin/learning/categories/${id}`, {
    method: "POST",
    body: payload
  });
}

export function deleteAdminLearningCategory(id: string) {
  return api<AdminMutationResponse>(`/admin/learning/categories/${id}`, {
    method: "DELETE"
  });
}

export function restoreAdminLearningCategory(id: string) {
  return api<AdminLearningCategoryMutationResponse>(`/admin/learning/categories/${id}/restore`, {
    method: "POST"
  });
}

export function updateAdminLearningCategoryStatus(id: string, isPublished: boolean) {
  return api<AdminLearningCategoryMutationResponse>(`/admin/learning/categories/${id}/status`, {
    method: "POST",
    body: { isPublished }
  });
}

export function updateAdminLearningMaterialStatus(id: string, isPublished: boolean) {
  return api<AdminLearningMaterialMutationResponse>(`/admin/learning/materials/${id}/status`, {
    method: "POST",
    body: { isPublished }
  });
}

export function restoreAdminLearningMaterial(id: string) {
  return api<AdminLearningMaterialMutationResponse>(`/admin/learning/materials/${id}/restore`, {
    method: "POST"
  });
}

export function deleteAdminLearningMaterial(id: string) {
  return api<AdminMutationResponse>(`/admin/learning/materials/${id}`, {
    method: "DELETE"
  });
}

export function getAdminLessonAssessment(id: string) {
  return api<{ assessment: LessonAssessmentDraft }>(`/admin/learning/materials/${id}/assessment`);
}

export function updateAdminLessonAssessment(id: string, assessment: LessonAssessmentDraft) {
  return api<{ ok: true; assessment: LessonAssessmentDraft }>(`/admin/learning/materials/${id}/assessment`, {
    method: "PUT",
    body: assessment
  });
}

export type AssessmentReviewQueue = {
  total: number;
  homework: Array<{ id: string; user: { displayName: string; photoUrl: string | null } | null; lesson: { id: string; title: string } | null; version: number; text: string | null; submittedAt: string | null }>;
  quizzes: Array<{ id: string; user: { displayName: string; photoUrl: string | null } | null; lesson: { id: string; title: string } | null; attemptNumber: number; submittedAt: string | null }>;
};

export function getAssessmentReviewQueue() {
  return api<AssessmentReviewQueue>("/admin/learning/assessments/review-queue");
}

export function getHomeworkReview(id: string) {
  return api<{ submission: { id: string; text: string | null; version: number }; attachments: Array<{ id: string; fileName: string; contentType: string; sizeBytes: number; url: string }> }>(`/admin/learning/assessments/homework/${id}`);
}

export function reviewHomework(id: string, payload: { decision: "accepted" | "needs_revision"; comment: string | null; idempotencyKey: string }) {
  return api<{ ok: true }>(`/admin/learning/assessments/homework/${id}/review`, { method: "POST", body: payload });
}

export function getQuizReview(id: string) {
  return api<{ attempt: { id: string; userId: string; contentItemId: string; status: string }; questions: Array<{ id: string; type: string; prompt: string; points: number; optionsSnapshot: Array<{ id: string; text: string }>; answer: { text: string | null; selectedOptionIds: string[] } | null }> }>(`/admin/learning/assessments/quiz/${id}`);
}

export type AdminQuizAssessmentResult = {
  mode: "quiz";
  id: string;
  contentItemId: string;
  title: string;
  categoryTitle: string;
  status: string;
  attemptNumber: number;
  earnedPoints: number | null;
  maxPoints: number | null;
  percent: number | null;
  passingPercent: number | null;
  startedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  resetAt: string | null;
  resetReason: string | null;
  questions: Array<{
    id: string;
    type: "single_choice" | "multiple_choice" | "free_text";
    prompt: string;
    points: number;
    optionsSnapshot: Array<{ id: string; text: string }>;
    selectedOptionIds: string[];
    text: string | null;
    correctOptionIds: string[];
    earnedPoints: number | null;
    isCorrect: boolean | null;
  }>;
};

export type AdminHomeworkAssessmentResult = {
  mode: "homework";
  id: string;
  contentItemId: string;
  title: string;
  categoryTitle: string;
  prompt: string | null;
  status: string;
  version: number;
  text: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  acceptedAt: string | null;
  reviewDecision: string | null;
  reviewComment: string | null;
  reviewCreatedAt: string | null;
  resetAt: string | null;
  resetReason: string | null;
  attachments: Array<{ id: string; fileName: string; contentType: string; sizeBytes: number; url: string }>;
};

export type AdminAssessmentResult = AdminQuizAssessmentResult | AdminHomeworkAssessmentResult;

export function getAdminAssessmentResult(telegramId: string, mode: "quiz" | "homework", recordId: string) {
  return api<{ result: AdminAssessmentResult }>(`/admin/users/${encodeURIComponent(telegramId)}/learning/${mode}/${encodeURIComponent(recordId)}`);
}

export function reviewQuiz(id: string, payload: { questionPoints: Record<string, number>; comment: string | null; idempotencyKey: string }) {
  return api<{ ok: true; result: { status: string; percent: number | null } }>(`/admin/learning/assessments/quiz/${id}/review`, { method: "POST", body: payload });
}

export function resetQuizAttempts(id: string, reason: string | null = null) {
  return api<{ ok: true }>(`/admin/learning/assessments/quiz/${id}/reset-attempts`, { method: "POST", body: { reason } });
}

export function resetHomeworkSubmission(id: string, reason: string | null = null) {
  return api<{ ok: true }>(`/admin/learning/assessments/homework/${id}/reset`, { method: "POST", body: { reason } });
}

export type LessonAssessmentStatus = {
  mode: "none" | "quiz" | "homework";
  attempts: Array<{
    id: string;
    attemptNumber: number;
    status: string;
    earnedPoints: number | null;
    maxPoints: number | null;
    percent: number | null;
    submittedAt: string | null;
    reviewComment: string | null;
    questions?: Array<{
      id: string;
      type: "single_choice" | "multiple_choice" | "free_text";
      prompt: string;
      points: number;
      optionsSnapshot: Array<{ id: string; text: string }>;
      selectedOptionIds: string[];
      text: string | null;
      correctOptionIds: string[];
      earnedPoints: number | null;
      isCorrect: boolean | null;
    }>;
  }>;
  submissions: Array<{ id: string; version: number; status: string; submittedAt: string | null; reviewedAt: string | null; resetAt: string | null; resetReason: string | null; reviewComment: string | null }>;
};

export type LessonQuizAttemptResponse = {
  attempt: {
    id: string;
    attemptNumber: number;
    maxAttempts: number;
    status: string;
    questions: Array<{
      id: string;
      type: "single_choice" | "multiple_choice" | "free_text";
      prompt: string;
      points: number;
      optionsSnapshot: Array<{ id: string; text: string }>;
    }>;
    answers: Array<{ questionId: string; selectedOptionIds: string[]; text: string | null }>;
  };
};

export function getLessonAssessmentStatus(id: string) {
  return api<LessonAssessmentStatus>(`/learning/items/${id}/assessment/status`);
}

export function startLessonQuiz(id: string) {
  return api<LessonQuizAttemptResponse>(`/learning/items/${id}/quiz/start`, { method: "POST", body: {} });
}

export function saveLessonQuizDraft(id: string, attemptId: string, answers: Array<{ questionId: string; selectedOptionIds: string[]; text: string | null }>) {
  return api<{ ok: true }>(`/learning/items/${id}/quiz/${attemptId}/answers`, { method: "PUT", body: { answers } });
}

export function submitLessonQuiz(id: string, attemptId: string, payload: { submissionKey: string; answers: Array<{ questionId: string; selectedOptionIds: string[]; text: string | null }> }) {
  return api<{ ok: true; result: { status: string; earnedPoints: number; maxPoints: number; percent: number } }>(`/learning/items/${id}/quiz/${attemptId}/submit`, { method: "POST", body: payload });
}

export function createHomeworkUpload(id: string, payload: { fileName: string; contentType: string; sizeBytes: number }) {
  return api<{ uploadUrl: string; objectKey: string; fileName: string; contentType: string; sizeBytes: number }>(`/learning/items/${id}/homework/uploads`, { method: "POST", body: payload });
}

export function submitLessonHomework(id: string, payload: { submissionKey: string; text: string | null; attachments: Array<{ objectKey: string; fileName: string; contentType: string; sizeBytes: number }> }) {
  return api<{ ok: true; submission: { id: string; version: number; status: string } }>(`/learning/items/${id}/homework/submit`, { method: "POST", body: payload });
}
