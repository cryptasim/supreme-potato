import type { ReactNode } from 'react';

interface KpiTileProps {
  label: string;
  value: ReactNode;
  /** Secondary line: comparison, unit explanation or caveat. */
  note?: ReactNode;
  /** Optional swatch tying the tile to a chart series (forecast/actual/risk/metric). */
  swatch?: 'forecast' | 'actual' | 'risk' | 'metric';
  /** Emphasise the tile that carries the decision (e.g. extra to procure). */
  emphasis?: boolean;
  badge?: ReactNode;
}

const SWATCH: Record<NonNullable<KpiTileProps['swatch']>, string> = {
  forecast: 'bg-forecast',
  actual: 'bg-actual',
  risk: 'bg-risk',
  metric: 'bg-metric',
};

export function KpiTile({ label, value, note, swatch, emphasis = false, badge }: KpiTileProps) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-1 rounded-xl border px-4 py-3.5 ${
        emphasis ? 'bg-risk-soft' : 'border-line bg-surface shadow-card'
      }`}
      style={emphasis ? { borderColor: 'color-mix(in srgb, var(--risk) 45%, transparent)' } : undefined}
    >
      <div className="flex items-center gap-2">
        {swatch && <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-sm ${SWATCH[swatch]}`} />}
        <span className="text-xs font-medium text-ink2">{label}</span>
        {badge && <span className="ml-auto">{badge}</span>}
      </div>
      <div className="break-words text-[22px] font-semibold leading-tight tracking-tight text-ink sm:text-[26px]">{value}</div>
      {note && <div className="text-xs leading-snug text-muted">{note}</div>}
    </div>
  );
}

export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 6 }) {
  const grid =
    cols === 6
      ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6'
      : cols === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : 'grid-cols-2 lg:grid-cols-4';
  return <div className={`grid gap-3 ${grid}`}>{children}</div>;
}
