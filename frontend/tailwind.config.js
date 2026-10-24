/** @type {import('tailwindcss').Config} */
// Colors resolve to CSS custom properties defined in src/index.css so that light/dark
// themes swap in one place and charts (SVG) can use the very same tokens.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--bg)',
        surface: 'var(--surface)',
        sunken: 'var(--surface-2)',
        ink: 'var(--ink)',
        ink2: 'var(--ink-2)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        grid: 'var(--grid)',
        brand: 'var(--brand)',
        'brand-ink': 'var(--brand-ink)',
        forecast: 'var(--forecast)',
        actual: 'var(--actual)',
        risk: 'var(--risk)',
        'risk-soft': 'var(--risk-soft)',
        metric: 'var(--metric)',
        good: 'var(--good)',
        critical: 'var(--critical)',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15, 23, 32, 0.04), 0 1px 0 rgba(15, 23, 32, 0.02)',
      },
    },
  },
  plugins: [],
};
