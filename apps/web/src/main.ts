import { createPinia } from "pinia";
import { createApp } from "vue";
import { currentRelease } from "@club/shared";
import App from "./App.vue";
import { reportClientError } from "./api/startup";
import { getOrCreateDeviceInstallationId } from "./features/app/deviceLayout";
import { installVueErrorHandler } from "./features/app/errorTrackerCapture";
import { startServiceWorkerLifecycle } from "./features/app/serviceWorkerLifecycle";
import { router } from "./router";
import "./styles.css";
import "./features/ui/foundation.css";

const app = createApp(App);
try { window.localStorage.setItem("club-release", currentRelease.version); } catch { /* diagnostics stay optional */ }
installVueErrorHandler(app, reportClientError, () => ({
  release: currentRelease.version,
  url: window.location.href,
  displayMode: window.matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser",
  online: navigator.onLine,
  installationId: getOrCreateDeviceInstallationId(),
  userAgent: navigator.userAgent,
  platform: navigator.platform || "unknown",
  viewport: { width: window.innerWidth, height: window.innerHeight }
}));
app.use(createPinia()).use(router).mount("#app");

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    startServiceWorkerLifecycle();
  });
}
