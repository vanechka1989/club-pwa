import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { startServiceWorkerLifecycle } from "./features/app/serviceWorkerLifecycle";
import { router } from "./router";
import "./styles.css";
import "./features/ui/foundation.css";
import "./features/community/community.css";

createApp(App).use(createPinia()).use(router).mount("#app");

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    startServiceWorkerLifecycle();
  });
}
