import { useCallback, useEffect, useState } from "react"

export const THEME_STORAGE_KEY = "callit-theme"

export type Theme = "light" | "dark"

export const DEFAULT_THEME: Theme = "dark"

// Inlined into the document head so the stored choice is applied before first
// paint, avoiding a flash of the default theme. Keep in sync with applyTheme.
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});document.documentElement.classList.toggle("dark",t!=="light")}catch(e){}`

function readStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return DEFAULT_THEME
  }
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light"
      ? "light"
      : "dark"
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Ignore storage failures (private mode, disabled storage).
  }
}

// SSR renders the default theme, so the first client render must match it to
// avoid hydration mismatch; the stored choice is reconciled in an effect.
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)

  useEffect(() => {
    setThemeState(readStoredTheme())
  }, [])

  const setTheme = useCallback((next: Theme) => {
    applyTheme(next)
    setThemeState(next)
  }, [])

  return { setTheme, theme }
}
