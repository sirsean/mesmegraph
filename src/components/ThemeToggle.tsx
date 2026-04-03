import { useState } from "react";
import { applyThemeToDocument, readStoredTheme, type Theme } from "../theme/initTheme";
import "./ThemeToggle.css";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyThemeToDocument(next);
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-pressed={theme === "light"}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      <span className="theme-toggle__mono" aria-hidden>
        {theme === "dark" ? "◐" : "◑"}
      </span>
      <span className="theme-toggle__label">{theme === "dark" ? "LIGHT" : "VOID"}</span>
    </button>
  );
}
