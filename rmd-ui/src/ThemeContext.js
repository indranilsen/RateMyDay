import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createTheme, ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const STORAGE_KEY = 'rmd-theme';

// Preference vocab: 'light' | 'dark' | 'system'. The actual `mode` ('light'
// or 'dark') is derived — when preference is 'system' we follow the OS via
// the `prefers-color-scheme` media query (and update live if the user
// toggles their OS theme without reloading).
const isValidPreference = (v) => v === 'light' || v === 'dark' || v === 'system';

const getStoredPreference = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isValidPreference(stored)) return stored;
  } catch (err) { /* private mode etc. — fall through */ }
  return 'system';
};

const getSystemMode = () => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
};

const buildTheme = (mode) => createTheme({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
          background: { default: '#ffffff', paper: '#ffffff' },
          text: { primary: '#404040', secondary: '#787878' }
        }
      : {
          background: { default: '#1a1a1a', paper: '#242424' },
          text: { primary: '#e0e0e0', secondary: '#9e9e9e' },
          primary: { main: '#90caf9' }
        })
  },
  components: {
    // Most `Paper elevation={0}` usages in the app are layout-only wrappers.
    // In light mode they blend with the page; in dark mode the slightly-
    // lighter paper background was reading as awkward rectangles. Override
    // elevation=0 to be transparent in dark mode so the layout wrappers
    // disappear; intentional surfaces use elevation>=1.
    MuiPaper: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundImage: theme.palette.mode === 'dark' ? 'none' : undefined
        }),
        elevation0: ({ theme }) => (
          theme.palette.mode === 'dark' ? { backgroundColor: 'transparent' } : {}
        )
      }
    }
  }
});

const ThemeContext = createContext({
  mode: 'light',
  preference: 'system',
  toggle: () => {},
  setPreference: () => {}
});

export const useColorMode = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
  const [preference, setPreferenceState] = useState(getStoredPreference);
  const [systemMode, setSystemMode] = useState(getSystemMode);

  // Listen for OS-level theme changes so 'system' updates without a reload
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemMode(e.matches ? 'dark' : 'light');
    // Use the modern API where available; fall back to deprecated addListener
    // for older Safari versions
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  // Persist preference whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch (err) { /* ignore */ }
  }, [preference]);

  // Effective mode: explicit preference wins; otherwise mirror the OS
  const mode = preference === 'system' ? systemMode : preference;

  const setPreference = useCallback((next) => {
    if (isValidPreference(next)) setPreferenceState(next);
  }, []);

  // Quick toggle: flip the effective mode. If we were on 'system', this
  // forces light or dark (locks it). User can return to 'system' via Settings.
  const toggle = useCallback(() => {
    setPreferenceState(mode === 'light' ? 'dark' : 'light');
  }, [mode]);

  const value = useMemo(
    () => ({ mode, preference, toggle, setPreference }),
    [mode, preference, toggle, setPreference]
  );
  const muiTheme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={muiTheme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};
