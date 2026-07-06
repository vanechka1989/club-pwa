export const pwaInstallRequestEventName = "club-pwa-install-request";

export function requestPwaInstallPrompt() {
  window.dispatchEvent(new CustomEvent(pwaInstallRequestEventName));
}
