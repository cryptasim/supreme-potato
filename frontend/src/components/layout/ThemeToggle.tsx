import { useEffect, useState } from 'react';

type Theme = 'system' | 'light' | 'dark';
const KEY = 'windsight-theme';

function readStored(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Cycles system → light → dark. "System" removes data-theme so prefers-color-scheme applies. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readStored);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      if (theme === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      /* storage unavailable: theme still applies for this session */
    }
  }, [theme]);

  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
  const label = { system: 'System theme', light: 'Light theme', dark: 'Dark theme' }[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(next[theme])}
      aria-label={`${label}. Switch to ${next[theme]} theme`}
      title={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink2 hover:bg-sunken hover:text-ink"
    >
      <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        {theme === 'dark' ? (
          <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z" strokeLinejoin="round" />
        ) : theme === 'light' ? (
          <>
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" strokeLinecap="round" />
          </>
        ) : (
          <>
            <rect x="2" y="3" width="12" height="8.5" rx="1.5" />
            <path d="M5.5 14h5" strokeLinecap="round" />
          </>
        )}
      </svg>
    </button>
  );
}
