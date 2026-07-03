import type {
  AdminAccessMutationResponse,
  AdminActionLogsResponse,
  AdminMailingMutationResponse,
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
  AdminListResponse,
  AdminModerationResponse,
  AdminUserDetailResponse,
  ClubChatMutationResponse,
  ClubChatsResponse,
  ClubMessageMutationResponse,
  ClubMessageReactionMutationResponse,
  ClubMessagesResponse,
  ClubTopicMutationResponse,
  ClubTopicsResponse,
  DeviceDiagnostics,
  DeviceDiagnosticsMutationResponse,
  AdminMutationResponse,
  AdminServerErrorsResponse,
  AdminServerStatusResponse,
  AdminStatsResponse,
  AdminStatsUser,
  LearningContentResponse,
  LessonCommentMutationResponse,
  LessonCommentsResponse,
  LearningHomeResponse,
  LearningPlaybackMutationResponse,
  LearningProgressMutationResponse,
  MessageReaction,
  MeResponse,
  PaymentsResponse,
  PaymentOrderLogsResponse,
  PaymentProductMutationResponse,
  PaymentProviderMutationResponse,
  S3StorageObjectUrlResponse,
  S3StorageObjectsResponse,
  S3StorageSettingsMutationResponse,
  S3StorageSettingsResponse,
  SubscribeResponse,
  SupportHomeResponse,
  AdminSupportResponse,
  AdminPermission,
  AppNotificationMutationResponse,
  AppNotificationsResponse,
  SupportTicketMutationResponse,
  SupportUnreadResponse
} from "@club/shared";
import { ofetch } from "ofetch";

const apiUrl = import.meta.env.VITE_API_URL ?? "/api";
const devTelegramUser = import.meta.env.VITE_DEV_TELEGRAM_USER;
const previewModeStorageKey = "club-preview-mode";

function getInitData() {
  return window.Telegram?.WebApp?.initData ?? "";
}

function withAuthHeaders(input?: HeadersInit) {
  const headers = new Headers(input);
  const initData = getInitData();
  if (initData) {
    headers.set("Authorization", `tma ${initData}`);
  } else if (devTelegramUser) {
    headers.set("X-Dev-Telegram-User", devTelegramUser);
  }

  const previewMode = localStorage.getItem(previewModeStorageKey);
  if (
    previewMode === "developer" ||
    previewMode === "admin" ||
    previewMode === "member-active" ||
    previewMode === "member-inactive"
  ) {
    headers.set("X-Club-Preview-Mode", previewMode);
  }

  return headers;
}

export const api = ofetch.create({
  baseURL: apiUrl,
  onRequest({ options }) {
    options.headers = withAuthHeaders(options.headers);
  }
});

export function getMe() {
  return api<MeResponse>("/me");
}

export function updateDeviceDiagnostics(payload: DeviceDiagnostics) {
  return api<DeviceDiagnosticsMutationResponse>("/me/device", {
    method: "POST",
    body: payload
  });
}

export function refreshAvatar() {
  return api<MeResponse>("/me/avatar", { method: "POST" });
}

export function createCheckout() {
  return api<SubscribeResponse>("/subscriptions/checkout", { method: "POST" });
}

export function createPaymentCheckout(productId: string) {
  return api<SubscribeResponse>("/payments/checkout", {
    method: "POST",
    body: { productId }
  });
}

export function getLearningHome() {
  return api<LearningHomeResponse>("/learning");
}

export function getLearningContent(id: string) {
  return api<LearningContentResponse>(`/learning/items/${id}`);
}

export function completeLearningContent(id: string) {
  return api<LearningProgressMutationResponse>(`/learning/items/${id}/complete`, { method: "POST" });
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

export function getLessonComments(id: string) {
  return api<LessonCommentsResponse>(`/learning/items/${id}/comments`);
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

export function createClubTopic(chatId: string, payload: { title: string; description?: string | null }) {
  return api<ClubTopicMutationResponse>(`/community/chats/${chatId}/topics`, {
    method: "POST",
    body: payload
  });
}

export function createCommunityTopic(payload: { title: string; description?: string | null }) {
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

export function getClubMessages(topicId: string) {
  return api<ClubMessagesResponse>(`/community/topics/${topicId}/messages`);
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

export function reactToClubMessage(messageId: string, reaction: MessageReaction | null) {
  return api<ClubMessageReactionMutationResponse>(`/community/messages/${messageId}/reaction`, {
    method: "POST",
    body: { reaction }
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

export function getPaymentHistory() {
  return api<PaymentOrderLogsResponse>("/payments/orders");
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

export function createPaymentProduct(payload: {
  kind: "one_time" | "recurrent";
  title: string;
  description?: string | null;
  amountRub: number;
  accessDays: number;
  prodamusSubscriptionId?: string | null;
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
    amountRub: number;
    accessDays: number;
    prodamusSubscriptionId?: string | null;
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

export function createSupportTicket(payload: FormData) {
  return api<SupportTicketMutationResponse>("/support/tickets", {
    method: "POST",
    body: payload
  });
}

export function createSupportTicketMessage(id: string, payload: FormData) {
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

export function replyAdminSupportTicket(id: string, payload: FormData) {
  return api<SupportTicketMutationResponse>(`/support/admin/tickets/${id}/replies`, {
    method: "POST",
    body: payload
  });
}

export function createAdminClientSupportTicket(telegramId: string, payload: FormData) {
  return api<SupportTicketMutationResponse>(`/support/admin/users/${telegramId}/tickets`, {
    method: "POST",
    body: payload
  });
}

export function getAppNotifications() {
  return api<AppNotificationsResponse>("/notifications");
}

export function markAppNotificationsRead() {
  return api<AppNotificationMutationResponse>("/notifications/read", { method: "POST" });
}

export function markAppNotificationRead(id: string) {
  return api<AppNotificationMutationResponse>(`/notifications/${id}/read`, { method: "POST" });
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

export function getAdminServerStatus() {
  return api<AdminServerStatusResponse>("/admin/server-status");
}

function getFileNameFromContentDisposition(value: string | null, fallback: string) {
  const match = value?.match(/filename="?(?<fileName>[^";]+)"?/);
  return match?.groups?.fileName || fallback;
}

export async function downloadAdminDatabaseBackup() {
  const response = await fetch(`${apiUrl.replace(/\/$/, "")}/admin/database/backup`, {
    headers: withAuthHeaders()
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

export function previewAdminMailing(payload: { channel: "bot" | "app" | "all"; filters: unknown }) {
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

export function getAdminUserStats(telegramId: string) {
  return api<AdminStatsUser>(`/admin/stats/users/${telegramId}`);
}

export function getAdminUserDetail(telegramId: string) {
  return api<AdminUserDetailResponse>(`/admin/stats/users/${telegramId}/detail`);
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
  isPublished: boolean;
  mediaUrl?: string | null;
  mediaObject?: AdminLearningUploadedObject | null;
  thumbnailObject?: AdminLearningUploadedObject | null;
  removeThumbnail?: boolean;
}) {
  return api<AdminLearningMaterialMutationResponse>("/admin/learning/materials/direct", {
    method: "POST",
    body: payload
  });
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

export function createAdminLearningCategory(payload: { title: string; description?: string | null; defaultCardLayout?: "vertical" | "horizontal" }) {
  return api<AdminLearningCategoryMutationResponse>("/admin/learning/categories", {
    method: "POST",
    body: payload
  });
}

export function updateAdminLearningCategory(id: string, payload: { title: string; description?: string | null; defaultCardLayout?: "vertical" | "horizontal" }) {
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
