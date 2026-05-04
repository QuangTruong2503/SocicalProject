import { useState, useEffect, useCallback } from 'react';
import { ThemeContext } from './theme';

// Theme Provider Component
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem('app-theme');
      if (['light', 'dark'].includes(savedTheme)) {
        return savedTheme;
      }
    } catch {
      // Ignore storage access errors and fall back to system preference.
    }

    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }

    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.classList.remove('theme-light', 'theme-dark');
    root.classList.add(`theme-${theme}`);

    try {
      localStorage.setItem('app-theme', theme);
    } catch {
      // Theme still applies even if localStorage is unavailable.
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  }, []);

  const setThemeMode = useCallback((mode) => {
    if (['light', 'dark'].includes(mode)) {
      setTheme(mode);
    }
  }, []);

  const value = {
    theme,
    toggleTheme,
    setThemeMode,
    isDark: theme === 'dark',
    isLight: theme === 'light',
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
