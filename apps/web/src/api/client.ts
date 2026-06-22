import type {
  AdminAccessMutationResponse,
  AdminListResponse,
  AdminMutationResponse,
  AdminStatsResponse,
  AdminStatsUser,
  LearningContentResponse,
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
