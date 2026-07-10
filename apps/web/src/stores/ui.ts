import { defineStore } from "pinia";
import { ref } from "vue";

export type Theme = "dark" | "light";
export type DesignTheme = "dark-soft-touch" | "graphite-electric-blue";
export type ColorScheme = "midnight" | "emerald" | "graphite" | "sakura" | "azure" | "coffee";
export type VisualScale = number;
export type PreviewMode = "developer" | "admin" | "member-active" | "member-inactive";

const visualScaleStorageVersion = "3";
const appearanceStorageVersion = "6";

function clampVisualScale(value: number | string | null) {
  const parsedValue = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  const safeValue = Number.isFinite(parsedValue) ? parsedValue : 1;
  return Math.min(2, Math.max(1, Math.round(safeValue * 10) / 10));
}

export const useUiStore = defineStore("ui", () => {
  const savedTheme = localStorage.getItem("club-theme");
  const theme = ref<Theme>(savedTheme === "light" ? "light" : "dark");
  const savedDesignTheme = localStorage.getItem("club-design-theme");
  const designTheme = ref<DesignTheme>(
    savedDesignTheme === "graphite-electric-blue" ? "graphite-electric-blue" : "dark-soft-touch"
  );
  const colorScheme = ref<ColorScheme>("midnight");
  const savedPreviewMode = localStorage.getItem("club-preview-mode");
  const previewMode = ref<PreviewMode>(
    savedPreviewMode === "admin" || savedPreviewMode === "member-active" || savedPreviewMode === "member-inactive"
      ? savedPreviewMode
      : "developer"
  );
  const savedVisualScaleVersion = localStorage.getItem("club-visual-scale-version");
  const savedVisualScale =
    savedVisualScaleVersion === visualScaleStorageVersion ? localStorage.getItem("club-visual-scale") : null;
  const visualScale = ref<VisualScale>(clampVisualScale(savedVisualScale));

  function persistVisualScale() {
    localStorage.setItem("club-visual-scale", visualScale.value.toFixed(1));
    localStorage.setItem("club-visual-scale-version", visualScaleStorageVersion);
  }

  function applyTheme() {
    const visualScaleText = visualScale.value.toFixed(1);
    document.documentElement.dataset.theme = theme.value;
    document.documentElement.dataset.designTheme = designTheme.value;
    document.documentElement.dataset.scheme = colorScheme.value;
    document.documentElement.dataset.visualScale = visualScaleText;
    document.documentElement.style.setProperty("--club-user-visual-scale", visualScaleText);
    document.documentElement.style.setProperty("--club-user-font-root", `${(16 * visualScale.value).toFixed(1)}px`);
    document.documentElement.style.setProperty("--club-user-font-base", `${(15 * visualScale.value).toFixed(1)}px`);
    document.documentElement.style.colorScheme = theme.value;
  }

  function setTheme(nextTheme: Theme) {
    theme.value = nextTheme;
    localStorage.setItem("club-theme", nextTheme);
    localStorage.setItem("club-appearance-version", appearanceStorageVersion);
    applyTheme();
  }

  function setDesignTheme(nextDesignTheme: DesignTheme) {
    designTheme.value = nextDesignTheme;
    localStorage.setItem("club-design-theme", nextDesignTheme);
    localStorage.setItem("club-appearance-version", appearanceStorageVersion);
    applyTheme();
  }

  function setColorScheme(_nextColorScheme: ColorScheme) {
    colorScheme.value = "midnight";
    localStorage.setItem("club-color-scheme", "midnight");
    localStorage.setItem("club-appearance-version", appearanceStorageVersion);
    applyTheme();
  }

  function setPreviewMode(nextPreviewMode: PreviewMode) {
    previewMode.value = nextPreviewMode;
    localStorage.setItem("club-preview-mode", nextPreviewMode);
    localStorage.removeItem("club-preview-membership");
  }

  function setVisualScale(nextVisualScale: number | string) {
    visualScale.value = clampVisualScale(nextVisualScale);
    persistVisualScale();
    applyTheme();
  }

  if (savedVisualScaleVersion !== visualScaleStorageVersion) {
    persistVisualScale();
  }

  applyTheme();

  localStorage.setItem("club-theme", theme.value);
  localStorage.setItem("club-design-theme", designTheme.value);
  localStorage.setItem("club-color-scheme", colorScheme.value);
  localStorage.setItem("club-appearance-version", appearanceStorageVersion);

  return {
    theme,
    designTheme,
    colorScheme,
    visualScale,
    previewMode,
    setTheme,
    setDesignTheme,
    setColorScheme,
    setVisualScale,
    setPreviewMode
  };
});
