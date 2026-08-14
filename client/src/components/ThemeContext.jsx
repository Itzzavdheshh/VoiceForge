import React from "react";

const ThemeContext = React.createContext(null);
const DEFAULT_THEME = "light";

function getStoredTheme() {
  try {
    const saved = localStorage.getItem("voiceforge:theme");
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }

  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function storeTheme(theme) {
  try {
    localStorage.setItem("voiceforge:theme", theme);
    // Dispatch a custom event so all open tabs can react immediately
    window.dispatchEvent(new CustomEvent("voiceforge:themeChanged", { detail: { theme } }));
  } catch {
    // Theme still works for the current session when persistence is unavailable.
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = React.useState(getStoredTheme);

  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    storeTheme(theme);
  }, [theme]);

  React.useEffect(() => {
    function handleStorage(event) {
      if (event.key === "voiceforge:theme" && (event.newValue === "dark" || event.newValue === "light")) {
        setTheme(event.newValue);
      }
    }

    function handleCustomEvent(event) {
      const newTheme = event.detail?.theme;
      if (newTheme === "dark" || newTheme === "light") {
        setTheme(newTheme);
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorage);
      window.addEventListener("voiceforge:themeChanged", handleCustomEvent);
      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener("voiceforge:themeChanged", handleCustomEvent);
      };
    }
  }, []);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
