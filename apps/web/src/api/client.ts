import type {
  AdminAccessMutationResponse,
  AdminListResponse,
  AdminModerationResponse,
  AdminMutesResponse,
  ClubChatMutationResponse,
  ClubChatsResponse,
  ClubMessageMutationResponse,
  ClubMessageReactionMutationResponse,
  ClubMessagesResponse,
  ClubTopicMutationResponse,
  ClubTopicsResponse,
  AdminMutationResponse,
  AdminStatsResponse,
  AdminStatsUser,
  LearningContentResponse,
  LessonCommentMutationResponse,
  LessonCommentsResponse,
  LearningHomeResponse,
  LearningProgressMutationResponse,
  MeResponse,
  PaymentsResponse,
  SubscribeResponse,
  SupportHomeResponse
} from "@club/shared";
import { ofetch } from "ofetch";

const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const devTelegramUser = import.meta.env.VITE_DEV_TELEGRAM_USER;
const previewMembershipStorageKey = "club-preview-membership";

function getInitData() {
  return window.Telegram?.WebApp?.initData ?? "";
}

export const api = ofetch.create({
  baseURL: apiUrl,
  onRequest({ options }) {
    const initData = getInitData();
    if (initData) {
      const headers = new Headers(options.headers);
      headers.set("Authorization", `tma ${initData}`);
      options.headers = headers;
    } else if (devTelegramUser) {
      const headers = new Headers(options.headers);
      headers.set("X-Dev-Telegram-User", devTelegramUser);
      options.headers = headers;
    }

    const previewMembership = localStorage.getItem(previewMembershipStorageKey);
    if (previewMembership === "active" || previewMembership === "inactive") {
      const headers = new Headers(options.headers);
      headers.set("X-Club-Preview-Membership", previewMembership);
      options.headers = headers;
    }
  }
});

export function getMe() {
  return api<MeResponse>("/me");
}

export function createCheckout() {
  return api<SubscribeResponse>("/subscriptions/checkout", { method: "POST" });
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

export function createClubMessage(topicId: string, body: string, replyToMessageId?: string | null) {
  return api<ClubMessageMutationResponse>(`/community/topics/${topicId}/messages`, {
    method: "POST",
    body: { body, replyToMessageId: replyToMessageId ?? null }
  });
}

export function reactToClubMessage(messageId: string, reaction: "like" | "dislike" | null) {
  return api<ClubMessageReactionMutationResponse>(`/community/messages/${messageId}/reaction`, {
    method: "POST",
    body: { reaction }
  });
}

export function getPaymentPlans() {
  return api<PaymentsResponse>("/payments/plans");
}

export function getSupportHome() {
  return api<SupportHomeResponse>("/support");
}

export function getAdminUsers() {
  return api<AdminListResponse>("/admin/admins");
}

export function addAdminUser(telegramId: string) {
  return api<AdminMutationResponse>("/admin/admins", {
    method: "POST",
    body: { telegramId }
  });
}

export function removeAdminUser(telegramId: string) {
  return api<AdminMutationResponse>(`/admin/admins/${telegramId}`, {
    method: "DELETE"
  });
}

export function getAdminStats() {
  return api<AdminStatsResponse>("/admin/stats");
}

export function getAdminUserStats(telegramId: string) {
  return api<AdminStatsUser>(`/admin/stats/users/${telegramId}`);
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

export function getAdminMutes() {
  return api<AdminMutesResponse>("/admin/mutes");
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
