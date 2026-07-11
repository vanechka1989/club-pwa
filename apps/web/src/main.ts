import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import "./styles.css";
import "./features/ui/foundation.css";
import "./features/community/community.css";

createApp(App).use(createPinia()).use(router).mount("#app");

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  let refreshing = false;

  const activateWaitingServiceWorker = (registration: ServiceWorkerRegistration) => {
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  };

  const watchServiceWorkerUpdate = (registration: ServiceWorkerRegistration) => {
    activateWaitingServiceWorker(registration);

    registration.addEventListener("updatefound", () => {
      const installingWorker = registration.installing;

      installingWorker?.addEventListener("statechange", () => {
        if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
          activateWaitingServiceWorker(registration);
        }
      });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void registration.update().then(() => activateWaitingServiceWorker(registration));
      }
    });
  };

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) {
      return;
    }
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update().then(() => registration))
      .then(watchServiceWorkerUpdate);
  });
}
