import type {
  AdminAccessMutationResponse,
  AcquisitionAttribution,
  AcquisitionLinkInput,
  AdminAcquisitionDashboard,
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
  DeviceDiagnostics,
  DeviceDiagnosticsMutationResponse,
  AdminMutationResponse,
  AdminServerErrorsResponse,
  AdminServerStatusResponse,
  AdminIntegrationHealthResponse,
  AdminStatsResponse,
  AdminStatsUser,
  LearningContentResponse,
  LearningSaveOperationResponse,
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
  ReferralActivationResponse,
  ReferralProfileResponse,
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
  AppStateResponse,
  SupportTicketMutationResponse,
  SupportUnreadResponse,
  AcquisitionDestination
} from "@club/shared";
import { getCommunityVoiceUploadFileName } from "../features/community/voiceUpload";
import { isInstalledPwaDisplay } from "@/features/app/pwaDisplay";
import { ofetch } from "ofetch";

const apiUrl = import.meta.env.VITE_API_URL ?? "/api";
const previewModeStorageKey = "club-preview-mode";
const pwaStandaloneAuthHeaderName = "X-Club-PWA-Standalone";

function isStandalonePwa() {
  return isInstalledPwaDisplay();
}

export function getApiRequestHeaders(input?: HeadersInit) {
  const headers = new Headers(input);
  const previewMode = localStorage.getItem(previewModeStorageKey);
  if (
    previewMode === "developer" ||
    previewMode === "admin" ||
    previewMode === "member-active" ||
    previewMode === "member-inactive"
  ) {
    headers.set("X-Club-Preview-Mode", previewMode);
  }
  if (isStandalonePwa()) {
    headers.set(pwaStandaloneAuthHeaderName, "1");
  }

  return headers;
}

export const api = ofetch.create({
  baseURL: apiUrl,
  credentials: "include",
  onRequest({ options }) {
    options.headers = getApiRequestHeaders(options.headers);
  }
});

export function reportClientError(payload: {
  kind: string;
  message: string;
  url?: string;
  userAgent?: string;
  platform?: string;
  viewport?: { width: number; height: number };
  detail?: unknown;
}) {
  return api<{ ok: boolean }>("/client-errors", { method: "POST", body: payload });
}

export function requestEmailCode(payload: { email: string; referralCode?: string | null; acquisitionVisitorId?: string | null }) {
  return api<{ ok: boolean; devCode: string | null; retryAfterSeconds?: number }>("/auth/email/start", {
    method: "POST",
    body: payload
  });
}

export function verifyEmailCode(payload: { email: string; code: string; referralCode?: string | null; acquisitionVisitorId?: string | null }) {
  return api<{ ok: boolean }>("/auth/email/verify", {
    method: "POST",
    body: payload
  });
}

export function recordAcquisitionVisit(payload: { aid: string; visitorId: string }) {
  return api<{ accepted: boolean; destination: AcquisitionDestination }>("/analytics/acquisition/visit", { method: "POST", body: payload });
}

export function logoutSession() {
  return api<{ ok: boolean }>("/auth/logout", { method: "POST" });
}

export function getWebPushPublicKey() {
  return api<{ publicKey: string | null }>("/push/vapid-public-key");
}

export function saveWebPushSubscription(subscription: PushSubscriptionJSON) {
  return api<{ ok: boolean }>("/push/subscriptions", {
    method: "POST",
    body: subscription
  });
}

export function deleteWebPushSubscription(subscription: PushSubscriptionJSON) {
  return api<{ ok: boolean }>("/push/subscriptions", {
    method: "DELETE",
    body: subscription
  });
}

export function getMe() {
  return api<MeResponse>("/me");
}

export function getAppState() {
  return api<AppStateResponse>("/app-state");
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

export type AvatarDisplayDraft = {
  avatarPositionX: number;
  avatarPositionY: number;
  avatarScale: number;
};

export function createAvatarUploadFormData(file: File, display: AvatarDisplayDraft) {
  const formData = new FormData();
  formData.append("avatar", file);
  formData.append("avatarPositionX", String(display.avatarPositionX));
  formData.append("avatarPositionY", String(display.avatarPositionY));
  formData.append("avatarScale", String(display.avatarScale));
  return formData;
}

export function uploadAvatar(file: File, display: AvatarDisplayDraft) {
  const formData = createAvatarUploadFormData(file, display);

  return api<MeResponse>("/me/avatar/upload", {
    method: "POST",
    body: formData
  });
}

export function updateAvatarDisplay(payload: AvatarDisplayDraft) {
  return api<MeResponse>("/me/avatar/display", {
    method: "PATCH",
    body: payload
  });
}

export function updateDisplayName(displayName: string) {
  return api<MeResponse>("/me/display-name", { method: "PATCH", body: { displayName } });
}

export function getReferralProfile() {
  return api<ReferralProfileResponse>("/me/referrals");
}

export function activateReferralRewards() {
  return api<ReferralActivationResponse>("/me/referrals/activate", { method: "POST" });
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
  badgeLabel?: string | null;
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
    badgeLabel?: string | null;
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

export function clearAppNotifications() {
  return api<AppNotificationMutationResponse>("/notifications", { method: "DELETE" });
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

export function getAdminAcquisitionDashboard(options: { from?: string; to?: string; attribution: AcquisitionAttribution }) {
  const query = new URLSearchParams({ attribution: options.attribution });
  if (options.from) query.set("from", options.from);
  if (options.to) query.set("to", options.to);
  return api<AdminAcquisitionDashboard>(`/admin/acquisition/dashboard?${query}`);
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
