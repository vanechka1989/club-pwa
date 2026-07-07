import { defineStore } from "pinia";
import { ref } from "vue";

export type Theme = "dark" | "light";
export type ColorScheme =
  | "midnight"
  | "emerald"
  | "graphite"
  | "sakura"
  | "azure"
  | "coffee"
  | "soft-black"
  | "soft-graphite"
  | "soft-milk"
  | "soft-blue";
export type VisualScale = number;
export type PreviewMode = "developer" | "admin" | "member-active" | "member-inactive";

const visualScaleStorageVersion = "2";
const colorSchemes = new Set<ColorScheme>([
  "midnight",
  "emerald",
  "graphite",
  "sakura",
  "azure",
  "coffee",
  "soft-black",
  "soft-graphite",
  "soft-milk",
  "soft-blue"
]);

function clampVisualScale(value: number | string | null) {
  const parsedValue = typeof value === "number" ? value : Number.parseFloat(value ?? "");
  const safeValue = Number.isFinite(parsedValue) ? parsedValue : 1;
  return Math.min(2, Math.max(1, Math.round(safeValue * 10) / 10));
}

function isColorScheme(value: string | null): value is ColorScheme {
  return Boolean(value && colorSchemes.has(value as ColorScheme));
}

export const useUiStore = defineStore("ui", () => {
  const savedTheme = localStorage.getItem("club-theme");
  const theme = ref<Theme>(savedTheme === "dark" ? "dark" : "light");
  const savedColorScheme = localStorage.getItem("club-color-scheme");
  const colorScheme = ref<ColorScheme>(isColorScheme(savedColorScheme) ? savedColorScheme : "azure");
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
    const effectiveVisualScale = visualScale.value * 2;
    document.documentElement.dataset.theme = theme.value;
    document.documentElement.dataset.scheme = colorScheme.value;
    document.documentElement.dataset.visualScale = visualScaleText;
    document.documentElement.style.setProperty("--club-user-visual-scale", visualScaleText);
    document.documentElement.style.setProperty("--club-user-font-root", `${(16 * effectiveVisualScale).toFixed(1)}px`);
    document.documentElement.style.setProperty("--club-user-font-base", `${(15 * effectiveVisualScale).toFixed(1)}px`);
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
    persistVisualScale();
    applyTheme();
  }

  if (savedVisualScaleVersion !== visualScaleStorageVersion) {
    persistVisualScale();
  }

  applyTheme();

  return { theme, colorScheme, visualScale, previewMode, setTheme, setColorScheme, setVisualScale, setPreviewMode };
});
