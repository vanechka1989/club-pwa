import { defineStore } from "pinia";
import { ref } from "vue";

export type Theme = "dark" | "light";
export type ColorScheme = "midnight" | "emerald" | "graphite" | "sakura" | "azure" | "coffee";
export type PreviewMode = "developer" | "admin" | "member-active" | "member-inactive";

export const useUiStore = defineStore("ui", () => {
  const savedTheme = localStorage.getItem("club-theme");
  const theme = ref<Theme>(savedTheme === "dark" ? "dark" : "light");
  const savedColorScheme = localStorage.getItem("club-color-scheme");
  const colorScheme = ref<ColorScheme>(
    savedColorScheme === "emerald" ||
      savedColorScheme === "graphite" ||
      savedColorScheme === "sakura" ||
      savedColorScheme === "azure" ||
      savedColorScheme === "coffee"
      ? savedColorScheme
      : "azure"
  );
  const savedPreviewMode = localStorage.getItem("club-preview-mode");
  const previewMode = ref<PreviewMode>(
    savedPreviewMode === "admin" || savedPreviewMode === "member-active" || savedPreviewMode === "member-inactive"
      ? savedPreviewMode
      : "developer"
  );
  const fullscreenDefaultVersion = "1.07";
  const savedFullscreenPreference = localStorage.getItem("club-fullscreen-enabled");
  const savedFullscreenDefaultVersion = localStorage.getItem("club-fullscreen-default-version");
  const shouldApplyFullscreenDefault = savedFullscreenDefaultVersion !== fullscreenDefaultVersion;
  const fullscreenEnabled = ref(shouldApplyFullscreenDefault ? true : savedFullscreenPreference !== "false");

  if (shouldApplyFullscreenDefault) {
    localStorage.setItem("club-fullscreen-enabled", "true");
    localStorage.setItem("club-fullscreen-default-version", fullscreenDefaultVersion);
  }

  function applyTheme() {
    document.documentElement.dataset.theme = theme.value;
    document.documentElement.dataset.scheme = colorScheme.value;
    document.documentElement.style.colorScheme = theme.value;
  }

  function setTheme(nextTheme: Theme) {
    theme.value = nextTheme;
    localStorage.setItem("club-theme", nextTheme);
    applyTheme();
  }

  function setColorScheme(nextColorScheme: ColorScheme) {
    colorScheme.value = nextColorScheme;
    localStorage.setItem("club-color-scheme", nextColorScheme);
    applyTheme();
  }

  function setPreviewMode(nextPreviewMode: PreviewMode) {
    previewMode.value = nextPreviewMode;
    localStorage.setItem("club-preview-mode", nextPreviewMode);
    localStorage.removeItem("club-preview-membership");
  }

  function setFullscreenEnabled(isEnabled: boolean) {
    fullscreenEnabled.value = isEnabled;
    localStorage.setItem("club-fullscreen-enabled", String(isEnabled));
  }

  applyTheme();

  return { theme, colorScheme, previewMode, fullscreenEnabled, setTheme, setColorScheme, setPreviewMode, setFullscreenEnabled };
});
