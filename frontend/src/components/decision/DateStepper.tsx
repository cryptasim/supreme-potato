import { addDays, fmtLongDate } from '../../lib/format';

interface DateStepperProps {
  value: string;
  min: string;
  max: string;
  onChange: (ymd: string) => void;
}

const btn =
  'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink2 hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40';

/** Delivery-date picker clamped to the decision window, with previous/next day buttons. */
export function DateStepper({ value, min, max, onChange }: DateStepperProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor="delivery-date" className="text-xs font-medium text-ink2">
        Delivery day
      </label>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={btn}
          onClick={() => onChange(addDays(value, -1))}
          disabled={value <= min}
          aria-label="Previous delivery day"
        >
          <svg aria-hidden width="14" height="14" viewBox="0 0 14 14"><path d="M8.5 3 4.5 7l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <input
          id="delivery-date"
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const v = e.target.value;
            if (v && v >= min && v <= max) onChange(v);
          }}
          className="tabular h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink"
          aria-describedby="delivery-date-long"
        />
        <button
          type="button"
          className={btn}
          onClick={() => onChange(addDays(value, 1))}
          disabled={value >= max}
          aria-label="Next delivery day"
        >
          <svg aria-hidden width="14" height="14" viewBox="0 0 14 14"><path d="M5.5 3 9.5 7l-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <span id="delivery-date-long" className="text-[11px] text-muted">
        {fmtLongDate(value)} · decided {fmtLongDate(addDays(value, -1))}
      </span>
    </div>
  );
}
