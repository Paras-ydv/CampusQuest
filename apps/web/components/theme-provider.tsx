"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "cq-theme";

type ThemeContextValue = {
  theme: Theme;
  /** What is actually on screen once "system" is resolved. */
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server render and first client render must agree, so start at "system"
  // and correct in an effect. The inline script in the layout has already
  // painted the right colours by then.
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    let stored: Theme = "system";
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "dark" || raw === "light") stored = raw;
    } catch {
      /* private mode, blocked storage — fall back to system */
    }
    setThemeState(stored);
    setResolved(
      stored === "system" ? (systemPrefersDark() ? "dark" : "light") : stored,
    );
  }, []);

  // Track OS changes only while the user is on "system".
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(mq.matches ? "dark" : "light");
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    const root = document.documentElement;
    if (next === "system") {
      root.removeAttribute("data-theme");
      setResolved(systemPrefersDark() ? "dark" : "light");
    } else {
      root.setAttribute("data-theme", next);
      setResolved(next);
    }
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* nothing to do — the choice just won't persist */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === "dark" ? "light" : "dark");
  }, [resolved, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
