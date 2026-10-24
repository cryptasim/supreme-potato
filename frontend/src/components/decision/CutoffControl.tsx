import { useMemo } from 'react';
import { CUTOFF_PRESETS, buildCutoffOptions } from '../../lib/cutoff';

interface CutoffControlProps {
  value: string;
  onChange: (cutoff: string) => void;
  runTimes?: string[];
  id?: string;
}

/**
 * Decision cut-off on D-1: market-anchored presets as chips, plus a free select whose options
 * say which forecast run each time would pick up.
 */
export function CutoffControl({ value, onChange, runTimes, id = 'cutoff' }: CutoffControlProps) {
  const options = useMemo(() => {
    const opts = buildCutoffOptions(runTimes);
    // Keep an off-grid value (e.g. 09:45 preset or a URL value) selectable.
    if (!opts.some((o) => o.value === value)) {
      opts.push({ value, label: `${value} · custom` });
      opts.sort((a, b) => a.value.localeCompare(b.value));
    }
    return opts;
  }, [runTimes, value]);

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-ink2">
        Decision cut-off on D-1 (UTC)
      </label>
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="tabular h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div role="group" aria-label="Cut-off presets" className="flex flex-wrap gap-1.5">
          {CUTOFF_PRESETS.map((p) => {
            const active = p.cutoff === value;
            return (
              <button
                key={p.cutoff}
                type="button"
                aria-pressed={active}
                title={p.hint}
                onClick={() => onChange(p.cutoff)}
                className={`h-9 rounded-lg border px-2.5 text-left text-[11px] leading-tight transition-colors ${
                  active ? 'border-transparent bg-brand text-brand-ink' : 'border-line bg-surface text-ink2 hover:bg-sunken'
                }`}
              >
                <span className="tabular block font-semibold">{p.label}</span>
                <span className={`block ${active ? 'opacity-85' : 'text-muted'}`}>{p.hint}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
