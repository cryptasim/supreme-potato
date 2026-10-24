import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useMeta } from '../../api/hooks';
import { fmtUtcDate } from '../../lib/format';
import { ThemeToggle } from './ThemeToggle';

const NAV = [
  { to: '/', label: 'Decision Desk', end: true },
  { to: '/accuracy', label: 'Forecast Accuracy', end: false },
  { to: '/methodology', label: 'Methodology', end: false },
];

function Logo() {
  return (
    <svg aria-hidden width="26" height="26" viewBox="0 0 32 32" className="shrink-0">
      <rect width="32" height="32" rx="7" fill="var(--brand)" />
      <path d="M6 21c4-7 8-7 10 0s6 7 10 0" fill="none" stroke="var(--brand-ink)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M6 13c4-5 8-5 10 0s6 5 10 0" fill="none" stroke="var(--brand-ink)" strokeOpacity=".55" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const meta = useMeta();
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur" style={{ background: 'color-mix(in srgb, var(--surface) 92%, transparent)' }}>
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2.5" aria-label="WindSight home">
            <Logo />
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-tight text-ink">WindSight</span>
              <span className="block text-[11px] text-muted">Day-Ahead Wind Desk</span>
            </span>
          </NavLink>
          <nav aria-label="Main" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    isActive ? 'bg-sunken text-ink' : 'text-ink2 hover:bg-sunken hover:text-ink'
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[11px] text-ink2 md:inline-flex">
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.isError ? 'bg-critical' : 'bg-good'}`} />
              {meta.isError
                ? 'API unreachable'
                : `GB wind · delivery ${fmtUtcDate(meta.data?.delivery_from ?? '2026-01-02')} – ${fmtUtcDate(meta.data?.delivery_to ?? '2026-02-01')} 2026`}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted sm:px-6">
          <span>
            Contains BMRS data © Elexon Limited copyright and database right {new Date().getUTCFullYear()}.{' '}
            <a className="underline underline-offset-2 hover:text-ink" href="https://www.elexon.co.uk/bsc/data/balancing-mechanism-reporting-agent/copyright-licence-bmrs-data/" target="_blank" rel="noreferrer">
              Licence
            </a>
          </span>
          <span>
            {meta.data
              ? `${meta.data.data_mode === 'live' ? 'Live' : 'Snapshot'} data · ${meta.data.forecast_runs} forecast runs · times in UTC`
              : 'Times in UTC (= UK time in January)'}
          </span>
        </div>
      </footer>
    </div>
  );
}
