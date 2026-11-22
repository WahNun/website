"use client";

import { useSyncExternalStore } from "react";

export type ThemeName = "graphit" | "reinweiss";
const STORAGE_KEY = "wahnon-theme";
const EVENT = "wahnon-theme";

function currentTheme(): ThemeName {
  return document.documentElement.dataset.theme === "reinweiss" ? "reinweiss" : "graphit";
}

export function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(
    (notify) => {
      window.addEventListener(EVENT, notify);
      return () => window.removeEventListener(EVENT, notify);
    },
    currentTheme,
    (): ThemeName => "graphit",
  );

  function choose(next: ThemeName) {
    applyTheme(next);
  }

  return (
    <div className={className ? `theme-toggle ${className}` : "theme-toggle"} role="group" aria-label="Colour palette">
      <button
        type="button"
        aria-pressed={theme === "graphit"}
        title="Graphit & Silber"
        onClick={() => choose("graphit")}
      >
        Graphit
      </button>
      <button
        type="button"
        aria-pressed={theme === "reinweiss"}
        title="Reinweiss auf Schwarz"
        onClick={() => choose("reinweiss")}
      >
        Weiss
      </button>
    </div>
  );
}
