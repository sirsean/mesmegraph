import { THEME_STORAGE_KEY } from "./constants";

export type Theme = "dark" | "light";

export function readStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function applyThemeToDocument(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  const meta = document.getElementById("meta-theme-color") as HTMLMetaElement | null;
  if (meta) {
    meta.content = theme === "dark" ? "#1a1a1a" : "#e9e4db";
  }
}

applyThemeToDocument(readStoredTheme());
