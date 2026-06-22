import { defineStore } from "pinia";
import { ref } from "vue";

export type Theme = "dark" | "light";
export type PreviewMembership = "real" | "inactive" | "active";

export const useUiStore = defineStore("ui", () => {
  const savedTheme = localStorage.getItem("club-theme");
  const theme = ref<Theme>(savedTheme === "light" ? "light" : "dark");
  const savedPreviewMembership = localStorage.getItem("club-preview-membership");
  const previewMembership = ref<PreviewMembership>(
    savedPreviewMembership === "inactive" || savedPreviewMembership === "active" ? savedPreviewMembership : "real"
  );

  function applyTheme() {
    document.documentElement.dataset.theme = theme.value;
    document.documentElement.style.colorScheme = theme.value;
  }

  function setTheme(nextTheme: Theme) {
    theme.value = nextTheme;
    localStorage.setItem("club-theme", nextTheme);
    applyTheme();
  }

  function setPreviewMembership(nextPreviewMembership: PreviewMembership) {
    previewMembership.value = nextPreviewMembership;
    localStorage.setItem("club-preview-membership", nextPreviewMembership);
  }

  applyTheme();

  return { theme, previewMembership, setTheme, setPreviewMembership };
});
