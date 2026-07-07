import { defineStore } from "pinia";
import { ref } from "vue";

export type Theme = "dark" | "light";
export type ColorScheme = "midnight" | "emerald" | "graphite" | "sakura" | "azure" | "coffee";
export type VisualScale = number;
export type PreviewMode = "developer" | "admin" | "member-active" | "member-inactive";

function clampVisualScale(value: number | string | null) {
  const parsedValue = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  const safeValue = Number.isFinite(parsedValue) ? parsedValue : 1;
  return Math.min(2, Math.max(1, Math.round(safeValue * 10) / 10));
}

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
  const savedVisualScale = localStorage.getItem("club-visual-scale");
  const visualScale = ref<VisualScale>(clampVisualScale(savedVisualScale));

  function applyTheme() {
    const visualScaleText = visualScale.value.toFixed(1);
    document.documentElement.dataset.theme = theme.value;
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

  function setVisualScale(nextVisualScale: number | string) {
    visualScale.value = clampVisualScale(nextVisualScale);
    localStorage.setItem("club-visual-scale", visualScale.value.toFixed(1));
    applyTheme();
  }

  applyTheme();

  return { theme, colorScheme, visualScale, previewMode, setTheme, setColorScheme, setVisualScale, setPreviewMode };
});
