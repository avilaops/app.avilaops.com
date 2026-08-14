"use client";

import { useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

export const storageKey = "avila-ops-theme-v2";

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem(storageKey) === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";

    window.localStorage.setItem(storageKey, nextTheme);
    applyTheme(nextTheme);
    setTheme(nextTheme);
  }

  return (
    <button
      aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
      className="theme-toggle"
      onClick={toggleTheme}
      title={theme === "dark" ? "Tema claro" : "Tema escuro"}
      type="button"
    >
      <span aria-hidden="true">{theme === "dark" ? "☼" : "☾"}</span>
    </button>
  );
}
