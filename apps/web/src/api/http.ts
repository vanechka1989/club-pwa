import { ofetch } from "ofetch";
import { isInstalledPwaDisplay } from "@/features/app/pwaDisplay";

export const apiUrl = import.meta.env.VITE_API_URL ?? "/api";
export const previewModeStorageKey = "club-preview-mode";
const pwaStandaloneAuthHeaderName = "X-Club-PWA-Standalone";

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
  if (isInstalledPwaDisplay()) {
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
