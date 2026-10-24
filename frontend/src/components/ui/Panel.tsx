import type { ReactNode } from 'react';

interface PanelProps {
  title?: ReactNode;
  /** Units / scope line under the title, e.g. "GW · hourly · UTC". */
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Dim content while a refetch is in flight, keeping the previous render (no layout jump). */
  busy?: boolean;
  id?: string;
}

/** The one card surface used across the app; charts, tables and headers all sit in a Panel. */
export function Panel({ title, subtitle, actions, children, className = '', busy = false, id }: PanelProps) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      aria-busy={busy || undefined}
      className={`min-w-0 rounded-xl border border-line bg-surface shadow-card ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && (
              <h2 id={headingId} className="text-[15px] font-semibold leading-snug text-ink">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`px-5 pb-5 pt-3 transition-opacity ${busy ? 'opacity-60' : ''}`}>{children}</div>
    </section>
  );
}
