import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";
type FontSize = "sm" | "base" | "lg";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  defaultFontSize?: FontSize;
  storageKey?: string;
  fontStorageKey?: string;
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  fontSize: FontSize;
  setFontSize: (fontSize: FontSize) => void;
}

const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
  fontSize: "base",
  setFontSize: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  defaultFontSize = "base",
  storageKey = "vite-ui-theme",
  fontStorageKey = "vite-ui-font-size",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );
  const [fontSize, setFontSize] = useState<FontSize>(
    () => (localStorage.getItem(fontStorageKey) as FontSize) || defaultFontSize
  );

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("text-sm", "text-base", "text-lg");
    
    // Mapping our FontSize to tailwind classes if needed, 
    // but better to set a data attribute or direct style for more control
    if (fontSize === "sm") {
      root.style.fontSize = "14px";
    } else if (fontSize === "base") {
      root.style.fontSize = "16px";
    } else if (fontSize === "lg") {
      root.style.fontSize = "18px";
    }
  }, [fontSize]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
    fontSize,
    setFontSize: (fontSize: FontSize) => {
      localStorage.setItem(fontStorageKey, fontSize);
      setFontSize(fontSize);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
}
