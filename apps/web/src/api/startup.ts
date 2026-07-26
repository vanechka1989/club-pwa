import type {
  AcquisitionDestination,
  AppNotificationMutationResponse,
  AppNotificationsResponse,
  AppStateResponse,
  DeviceDiagnostics,
  DeviceDiagnosticsMutationResponse,
  MeResponse,
  PaymentOrderLogsResponse,
  ReferralActivationResponse,
  ReferralProfileResponse,
  SubscribeResponse
} from "@club/shared";
import { api } from "./http";

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
  return api<{ ok: boolean }>("/auth/email/verify", { method: "POST", body: payload });
}

export function recordAcquisitionVisit(payload: { aid: string; visitorId: string }) {
  return api<{ accepted: boolean; destination: AcquisitionDestination }>("/analytics/acquisition/visit", {
    method: "POST",
    body: payload
  });
}

export function logoutSession() {
  return api<{ ok: boolean }>("/auth/logout", { method: "POST" });
}

export function getWebPushPublicKey() {
  return api<{ publicKey: string | null }>("/push/vapid-public-key");
}

export function saveWebPushSubscription(subscription: PushSubscriptionJSON) {
  return api<{ ok: boolean }>("/push/subscriptions", { method: "POST", body: subscription });
}

export function deleteWebPushSubscription(subscription: PushSubscriptionJSON) {
  return api<{ ok: boolean }>("/push/subscriptions", { method: "DELETE", body: subscription });
}

export function getMe() {
  return api<MeResponse>("/me");
}

export function getAppState() {
  return api<AppStateResponse>("/app-state");
}

export function updateDeviceDiagnostics(payload: DeviceDiagnostics) {
  return api<DeviceDiagnosticsMutationResponse>("/me/device", { method: "POST", body: payload });
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
  return api<MeResponse>("/me/avatar/upload", { method: "POST", body: createAvatarUploadFormData(file, display) });
}

export function updateAvatarDisplay(payload: AvatarDisplayDraft) {
  return api<MeResponse>("/me/avatar/display", { method: "PATCH", body: payload });
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

export function getPaymentHistory() {
  return api<PaymentOrderLogsResponse>("/payments/orders");
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
