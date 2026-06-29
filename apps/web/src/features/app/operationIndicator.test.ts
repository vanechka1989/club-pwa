import { cleanup, render, screen } from "@testing-library/vue";
import { createPinia, setActivePinia } from "pinia";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { nextTick } from "vue";
import { beforeEach, describe, expect, it } from "vitest";
import AppOperationIndicator from "./AppOperationIndicator.vue";
import { useOperationsStore } from "@/stores/operations";

describe("app operation indicator", () => {
  beforeEach(() => {
    cleanup();
    setActivePinia(createPinia());
  });

  it("renders an active save or upload operation in a global top layer", async () => {
    const pinia = createPinia();
    render(AppOperationIndicator, {
      global: {
        plugins: [pinia]
      }
    });

    const operations = useOperationsStore(pinia);
    operations.start({
      title: "Сохраняем урок...",
      detail: "Загрузка файла и обновление данных"
    });
    await nextTick();

    expect(screen.getByText("Сохраняем урок...").closest(".app-operation-indicator")).toBeTruthy();
    expect(screen.getByText("Загрузка файла и обновление данных")).toBeTruthy();
    expect(document.body.querySelector(".app-operation-progress")).toBeTruthy();
  });

  it("keeps the operation layer above modal backdrops and below alerts", () => {
    const styles = readFileSync(resolve(__dirname, "../../styles.css"), "utf8");

    expect(styles).toMatch(/\.app-operation-indicator\s*\{[^}]*z-index:\s*990;/s);
    expect(styles).toMatch(/\.app-toast-viewport\s*\{[^}]*z-index:\s*1000;/s);
    expect(styles).toMatch(/\.support-modal-backdrop\s*\{[^}]*z-index:\s*80;/s);
    expect(styles).toMatch(/\.admin-modal-backdrop\s*\{[^}]*z-index:\s*140;/s);
    expect(styles).toMatch(/\.payment-modal-backdrop\s*\{[^}]*z-index:\s*145;/s);
  });

  it("is wired into save and send sections but not the community chat", () => {
    const appSource = readFileSync(resolve(__dirname, "../../App.vue"), "utf8");
    const learningSource = readFileSync(resolve(__dirname, "../learning/LearningSection.vue"), "utf8");
    const supportSource = readFileSync(resolve(__dirname, "../support/SupportSection.vue"), "utf8");
    const paymentsSource = readFileSync(resolve(__dirname, "../billing/PaymentsSection.vue"), "utf8");
    const adminSource = readFileSync(resolve(__dirname, "../admin/AdminSection.vue"), "utf8");
    const communitySource = readFileSync(resolve(__dirname, "../community/CommunitySection.vue"), "utf8");

    expect(appSource).toContain("AppOperationIndicator");
    expect(learningSource).toContain("useOperationIndicator");
    expect(supportSource).toContain("useOperationIndicator");
    expect(paymentsSource).toContain("useOperationIndicator");
    expect(adminSource).toContain("useOperationIndicator");
    expect(communitySource).not.toContain("useOperationIndicator");
  });
});
