import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import "./styles.css";

createApp(App).use(createPinia()).mount("#app");

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
